import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import { google } from 'googleapis';

dotenv.config({ path: '.env.local' });
dotenv.config();

const app = express();
const port = Number(process.env.PORT || 8787);
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
const redirectUri =
  process.env.GOOGLE_REDIRECT_URI || `http://localhost:${port}/auth/google/callback`;
const membershipScope =
  'https://www.googleapis.com/auth/youtube.channel-memberships.creator';
const youtubeReadScope = 'https://www.googleapis.com/auth/youtube.readonly';
const obsConfigRoot =
  process.env.OBS_CONFIG_ROOT ||
  (process.platform === 'win32'
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
const nativeRosterPath =
  process.env.NATIVE_ROSTER_PATH ||
  path.join(
    obsConfigRoot,
    'obs-studio',
    'plugin_config',
    'member-credits',
    'member-roster.txt',
  );
let latestTokens = null;
let cachedRoster = null;
let liveMonitorTimer = null;
let livePageToken = null;
let liveChatId = null;

app.use(express.json());
app.use((request, response, next) => {
  response.header('Access-Control-Allow-Origin', frontendUrl);
  response.header('Access-Control-Allow-Credentials', 'true');
  response.header('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') return response.sendStatus(204);
  next();
});
app.use(
  session({
    name: 'member-credits.sid',
    secret: process.env.SESSION_SECRET || 'local-only-member-credits-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

function loadOAuthClient() {
  const credentialsPath = process.env.GOOGLE_CREDENTIALS_PATH;
  if (!credentialsPath) {
    throw new Error('GOOGLE_CREDENTIALS_PATH is not configured.');
  }

  const credentials = JSON.parse(fs.readFileSync(path.resolve(credentialsPath), 'utf8'));
  const config = credentials.web || credentials.installed;
  if (!config?.client_id || !config.client_secret) {
    throw new Error(
      'The Google credential JSON does not contain a web or installed client.',
    );
  }

  return new google.auth.OAuth2(config.client_id, config.client_secret, redirectUri);
}

function getAuthorizedClient(request) {
  if (!request.session.tokens) return null;
  const client = loadOAuthClient();
  client.setCredentials(request.session.tokens);
  rememberTokens(request.session.tokens);
  client.on('tokens', (tokens) => {
    request.session.tokens = { ...request.session.tokens, ...tokens };
    rememberTokens(request.session.tokens);
  });
  return client;
}

function apiError(error) {
  return {
    status: error.response?.status || 500,
    reason: error.response?.data?.error?.errors?.[0]?.reason || 'unknown_error',
    message: error.response?.data?.error?.message || error.message,
  };
}

function redirectWithError(response, error) {
  const message = encodeURIComponent(error.message || 'OAuth failed');
  response.redirect(`${frontendUrl}/?oauth=error&message=${message}`);
}

async function fetchRoster(client) {
  const youtube = google.youtube({ version: 'v3', auth: client });
  const levelsResponse = await youtube.membershipsLevels.list({
    part: ['id', 'snippet'],
  });
  const levels = (levelsResponse.data.items || []).map((level) => ({
    id: level.id,
    displayName: level.snippet?.levelDetails?.displayName || level.id,
  }));
  const members = [];
  let pageToken;

  do {
    const membersResponse = await youtube.members.list({
      maxResults: 1000,
      mode: 'all_current',
      pageToken,
      part: ['snippet'],
    });
    for (const member of membersResponse.data.items || []) {
      const details = member.snippet?.memberDetails;
      const membership = member.snippet?.membershipsDetails;
      members.push({
        channelId: details?.channelId || null,
        displayName: details?.displayName || null,
        profileImageUrl: details?.profileImageUrl || null,
        levelId: membership?.highestAccessibleLevel || null,
        levelName: membership?.highestAccessibleLevelDisplayName || null,
        memberSince: membership?.membershipsDuration?.memberSince || null,
        totalMonths: membership?.membershipsDuration?.memberTotalDurationMonths || 0,
      });
    }
    pageToken = membersResponse.data.nextPageToken;
  } while (pageToken);

  return { levels, members, fetchedAt: new Date().toISOString() };
}

function rosterText(members) {
  const groups = new Map();
  for (const member of members) {
    const displayName = String(member.displayName || '')
      .replace(/[\r\n]+/g, ' ')
      .trim();
    if (!displayName) continue;

    const levelName = String(member.levelName || 'YouTube Members')
      .replace(/[\[\]\r\n]+/g, ' ')
      .trim();
    const group = groups.get(levelName) || [];
    group.push(displayName);
    groups.set(levelName, group);
  }

  return [...groups]
    .map(([levelName, names]) => `[${levelName}]\n${names.join('\n')}`)
    .join('\n\n');
}

async function fetchLiveMembershipEvents(client, pageToken) {
  const youtube = google.youtube({ version: 'v3', auth: client });
  const broadcastsResponse = await youtube.liveBroadcasts.list({
    part: ['snippet', 'status'],
    broadcastStatus: 'active',
    mine: true,
    maxResults: 1,
  });
  const broadcast = broadcastsResponse.data.items?.[0];
  const liveChatId = broadcast?.snippet?.liveChatId;
  if (!liveChatId) {
    return {
      active: false,
      events: [],
      nextPageToken: null,
      pollingIntervalMillis: null,
    };
  }

  const messagesResponse = await youtube.liveChatMessages.list({
    liveChatId,
    part: ['id', 'snippet', 'authorDetails'],
    pageToken: pageToken || undefined,
    maxResults: 2000,
  });
  const events = [];

  for (const message of messagesResponse.data.items || []) {
    const snippet = message.snippet;
    const author = message.authorDetails?.displayName || 'YouTube member';
    if (!snippet?.type) continue;

    if (snippet.type === 'newSponsorEvent') {
      events.push({
        id: message.id,
        type: 'new_member',
        channelId: message.authorDetails?.channelId || null,
        displayName: author,
        levelName: snippet.newSponsorDetails?.memberLevelName || null,
        publishedAt: snippet.publishedAt || null,
      });
    } else if (snippet.type === 'giftMembershipReceivedEvent') {
      events.push({
        id: message.id,
        type: 'gifted_member',
        channelId: message.authorDetails?.channelId || null,
        displayName: author,
        levelName: snippet.giftMembershipReceivedDetails?.memberLevelName || null,
        gifterChannelId: snippet.giftMembershipReceivedDetails?.gifterChannelId || null,
        publishedAt: snippet.publishedAt || null,
      });
    } else if (snippet.type === 'membershipGiftingEvent') {
      events.push({
        id: message.id,
        type: 'membership_gift',
        channelId: message.authorDetails?.channelId || null,
        displayName: author,
        levelName: snippet.membershipGiftingDetails?.giftMembershipsLevelName || null,
        giftedCount: snippet.membershipGiftingDetails?.giftMembershipsCount || 0,
        publishedAt: snippet.publishedAt || null,
      });
    }
  }

  return {
    active: true,
    broadcastId: broadcast.id || null,
    liveChatId,
    events,
    nextPageToken: messagesResponse.data.nextPageToken || null,
    pollingIntervalMillis: messagesResponse.data.pollingIntervalMillis || 5000,
  };
}

function writeNativeRosterCache(roster) {
  fs.mkdirSync(path.dirname(nativeRosterPath), { recursive: true });
  fs.writeFileSync(nativeRosterPath, rosterText(roster.members), 'utf8');
  cachedRoster = roster;
}

function mergeLiveEventsIntoRoster(events) {
  if (!cachedRoster) return false;

  let changed = false;
  for (const event of events) {
    if (event.type !== 'new_member' && event.type !== 'gifted_member') continue;
    const alreadyIncluded = cachedRoster.members.some((member) =>
      event.channelId && member.channelId
        ? member.channelId === event.channelId
        : member.displayName === event.displayName,
    );
    if (alreadyIncluded || !event.displayName) continue;

    cachedRoster.members.push({
      channelId: event.channelId || null,
      displayName: event.displayName,
      profileImageUrl: null,
      levelId: null,
      levelName: event.levelName || 'YouTube Members',
      memberSince: null,
      totalMonths: 0,
    });
    changed = true;
  }

  if (changed) writeNativeRosterCache(cachedRoster);
  return changed;
}

function scheduleLiveMonitor(delay = 0) {
  if (liveMonitorTimer) clearTimeout(liveMonitorTimer);
  liveMonitorTimer = setTimeout(async () => {
    liveMonitorTimer = null;
    if (!latestTokens) return;

    try {
      const client = loadOAuthClient();
      client.setCredentials(latestTokens);
      const result = await fetchLiveMembershipEvents(client, livePageToken);
      if (!result.active) {
        livePageToken = null;
        liveChatId = null;
        scheduleLiveMonitor(15000);
        return;
      }

      if (liveChatId !== result.liveChatId) {
        liveChatId = result.liveChatId;
        livePageToken = result.nextPageToken;
      } else {
        livePageToken = result.nextPageToken;
      }
      mergeLiveEventsIntoRoster(result.events);
      scheduleLiveMonitor(result.pollingIntervalMillis || 5000);
    } catch (error) {
      console.error('Live membership monitor failed:', apiError(error));
      livePageToken = null;
      liveChatId = null;
      scheduleLiveMonitor(30000);
    }
  }, delay);
}

function rememberTokens(tokens) {
  latestTokens = { ...latestTokens, ...tokens };
  scheduleLiveMonitor();
}

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'member-credits-local-api' });
});

app.get('/auth/google', (request, response) => {
  try {
    const client = loadOAuthClient();
    const state = crypto.randomBytes(32).toString('hex');
    request.session.oauthState = state;
    const authorizationUrl = client.generateAuthUrl({
      access_type: 'offline',
      include_granted_scopes: true,
      prompt: 'consent',
      scope: [membershipScope, youtubeReadScope],
      state,
    });
    response.redirect(authorizationUrl);
  } catch (error) {
    redirectWithError(response, error);
  }
});

app.get('/auth/google/callback', async (request, response) => {
  try {
    if (request.query.error) {
      throw new Error(`Google OAuth error: ${request.query.error}`);
    }
    if (!request.query.state || request.query.state !== request.session.oauthState) {
      throw new Error('OAuth state mismatch. The authorization request was not trusted.');
    }

    const client = loadOAuthClient();
    const { tokens } = await client.getToken(String(request.query.code));
    client.setCredentials(tokens);
    request.session.tokens = tokens;
    rememberTokens(tokens);
    try {
      writeNativeRosterCache(await fetchRoster(client));
    } catch (error) {
      console.error('Initial YouTube roster sync failed:', apiError(error));
    }
    delete request.session.oauthState;
    response.redirect(`${frontendUrl}/?oauth=connected`);
  } catch (error) {
    redirectWithError(response, error);
  }
});

app.get('/api/auth/status', async (request, response) => {
  try {
    const client = getAuthorizedClient(request);
    if (!client) return response.json({ connected: false });

    const youtube = google.youtube({ version: 'v3', auth: client });
    const result = await youtube.channels.list({ part: ['snippet'], mine: true });
    const channel = result.data.items?.[0];
    response.json({
      connected: true,
      channel: channel
        ? { id: channel.id, title: channel.snippet?.title || 'YouTube channel' }
        : null,
    });
  } catch (error) {
    response.status(500).json({ connected: false, error: apiError(error) });
  }
});

app.get('/api/youtube/test', async (request, response) => {
  try {
    const client = getAuthorizedClient(request);
    if (!client) return response.status(401).json({ error: 'not_connected' });

    const roster = await fetchRoster(client);
    writeNativeRosterCache(roster);
    response.json({ ...roster, count: roster.members.length });
  } catch (error) {
    const details = apiError(error);
    response.status(details.status).json({ error: details });
  }
});

app.get('/api/youtube/roster.txt', async (request, response) => {
  try {
    const client = getAuthorizedClient(request);
    if (!client) return response.status(401).json({ error: 'not_connected' });

    const roster = await fetchRoster(client);
    writeNativeRosterCache(roster);
    response
      .type('text/plain')
      .attachment('member-roster.txt')
      .send(rosterText(roster.members));
  } catch (error) {
    const details = apiError(error);
    response.status(details.status).json({ error: details });
  }
});

app.get('/api/youtube/live/events', async (request, response) => {
  try {
    const client = getAuthorizedClient(request);
    if (!client) return response.status(401).json({ error: 'not_connected' });

    rememberTokens(request.session.tokens);
    response.json(
      await fetchLiveMembershipEvents(client, String(request.query.pageToken || '')),
    );
  } catch (error) {
    const details = apiError(error);
    response.status(details.status).json({ error: details });
  }
});

app.listen(port, () => {
  console.log(`Member Credits API listening at http://localhost:${port}`);
});
