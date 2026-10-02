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
const publicUrl = (process.env.PUBLIC_URL || frontendUrl).replace(/\/$/, '');
const frontendDistPath = path.join(process.cwd(), 'dist');
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
const sessionSecret = process.env.SESSION_SECRET || 'local-only-member-credits-secret';
const nativePairingLifetimeMs = 10 * 60 * 1000;
const nativeDeviceLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const nativePairings = new Map();
const nativeDevices = new Map();

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be configured in production.');
}

if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

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
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure:
        process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);
app.use(express.static(frontendDistPath));

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
  client.on('tokens', (tokens) => {
    request.session.tokens = { ...request.session.tokens, ...tokens };
  });
  return client;
}

function createAuthorizedClient(tokens, onTokens) {
  const client = loadOAuthClient();
  let currentTokens = { ...tokens };
  client.setCredentials(currentTokens);
  client.on('tokens', (refreshedTokens) => {
    currentTokens = { ...currentTokens, ...refreshedTokens };
    onTokens(currentTokens);
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

function setMembershipStatus(request, state, error = null) {
  request.session.membershipStatus = {
    state,
    ...(error ? { error } : {}),
    checkedAt: new Date().toISOString(),
  };
}

function removeExpiredNativeState() {
  const now = Date.now();
  for (const [id, pairing] of nativePairings) {
    if (pairing.expiresAt <= now) nativePairings.delete(id);
  }
  for (const [tokenHash, device] of nativeDevices) {
    if (device.expiresAt <= now) nativeDevices.delete(tokenHash);
  }
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getNativePairing(id, secret) {
  removeExpiredNativeState();
  const pairing = nativePairings.get(id);
  if (!pairing || typeof secret !== 'string') return null;
  const expected = Buffer.from(pairing.secret);
  const received = Buffer.from(secret);
  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    return null;
  }
  return pairing;
}

function getNativeDevice(request) {
  const authorization = request.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return null;
  removeExpiredNativeState();
  return nativeDevices.get(hashToken(token)) || null;
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
}

function mergeLiveEventsIntoRoster(roster, events) {
  if (!roster) return false;
  let changed = false;
  for (const event of events) {
    if (event.type !== 'new_member' && event.type !== 'gifted_member') continue;
    const alreadyIncluded = roster.members.some((member) =>
      event.channelId && member.channelId
        ? member.channelId === event.channelId
        : member.displayName === event.displayName,
    );
    if (alreadyIncluded || !event.displayName) continue;

    roster.members.push({
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

  return changed;
}

async function syncNativeDevice(device) {
  const client = createAuthorizedClient(device.tokens, (tokens) => {
    device.tokens = tokens;
  });

  if (!device.roster) device.roster = await fetchRoster(client);
  if (Date.now() < device.nextPollAt) return device.roster;

  const result = await fetchLiveMembershipEvents(client, device.livePageToken);
  if (!result.active) {
    device.livePageToken = null;
    device.liveChatId = null;
    device.nextPollAt = Date.now() + 15000;
    return device.roster;
  }

  if (device.liveChatId !== result.liveChatId) {
    device.liveChatId = result.liveChatId;
  }
  device.livePageToken = result.nextPageToken;
  device.nextPollAt = Date.now() + (result.pollingIntervalMillis || 5000);
  mergeLiveEventsIntoRoster(device.roster, result.events);
  return device.roster;
}

app.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'member-credits-local-api' });
});

app.get('/api/native/pairing/start', (_request, response) => {
  removeExpiredNativeState();
  const id = randomToken(16);
  const secret = randomToken(24);
  const pairing = {
    id,
    secret,
    createdAt: Date.now(),
    expiresAt: Date.now() + nativePairingLifetimeMs,
    deviceToken: null,
  };
  nativePairings.set(id, pairing);
  const authUrl = `${publicUrl}/auth/google?pairing=${encodeURIComponent(id)}&secret=${encodeURIComponent(secret)}`;
  response.set('Cache-Control', 'no-store');
  response
    .type('text/plain')
    .send(
      [
        `pairing_id=${id}`,
        `pairing_secret=${secret}`,
        `auth_url=${authUrl}`,
        `expires_at=${new Date(pairing.expiresAt).toISOString()}`,
      ].join('\n'),
    );
});

app.get('/api/native/pairing/status', (request, response) => {
  response.set('Cache-Control', 'no-store');
  const pairing = getNativePairing(
    String(request.query.id || ''),
    String(request.query.secret || ''),
  );
  if (!pairing) return response.status(404).type('text/plain').send('status=expired');
  if (!pairing.deviceToken) return response.type('text/plain').send('status=pending');
  response
    .type('text/plain')
    .send(`status=authorized\ndevice_token=${pairing.deviceToken}`);
});

app.get('/auth/google', (request, response) => {
  try {
    if (request.query.pairing || request.query.secret) {
      const pairing = getNativePairing(
        String(request.query.pairing || ''),
        String(request.query.secret || ''),
      );
      if (!pairing) throw new Error('This native pairing request has expired.');
      request.session.nativePairingId = pairing.id;
    }
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
    const pairing = request.session.nativePairingId
      ? nativePairings.get(request.session.nativePairingId)
      : null;
    if (pairing && pairing.expiresAt > Date.now()) {
      const deviceToken = randomToken(32);
      const device = {
        tokens,
        expiresAt: Date.now() + nativeDeviceLifetimeMs,
        roster: null,
        livePageToken: null,
        liveChatId: null,
        nextPollAt: 0,
      };
      nativeDevices.set(hashToken(deviceToken), device);
      pairing.deviceToken = deviceToken;
    }
    if (!pairing) {
      try {
        const roster = await fetchRoster(client);
        writeNativeRosterCache(roster);
        setMembershipStatus(request, 'available');
      } catch (error) {
        const details = apiError(error);
        setMembershipStatus(request, 'unavailable', details);
        console.error('Initial YouTube roster sync failed:', details);
      }
    }
    delete request.session.oauthState;
    delete request.session.nativePairingId;
    const membershipStatus = request.session.membershipStatus;
    if (membershipStatus?.state === 'unavailable') {
      const message = encodeURIComponent(
        `Google connected, but YouTube Memberships access failed: ${membershipStatus.error.message}`,
      );
      response.redirect(`${frontendUrl}/?oauth=error&message=${message}`);
      return;
    }
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
      membership: request.session.membershipStatus || { state: 'unknown' },
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
    setMembershipStatus(request, 'available');
    response.json({ ...roster, count: roster.members.length });
  } catch (error) {
    const details = apiError(error);
    setMembershipStatus(request, 'unavailable', details);
    response.status(details.status).json({ error: details });
  }
});

app.get('/api/youtube/roster.txt', async (request, response) => {
  try {
    const client = getAuthorizedClient(request);
    if (!client) return response.status(401).json({ error: 'not_connected' });

    const roster = await fetchRoster(client);
    writeNativeRosterCache(roster);
    setMembershipStatus(request, 'available');
    response
      .type('text/plain')
      .attachment('member-roster.txt')
      .send(rosterText(roster.members));
  } catch (error) {
    const details = apiError(error);
    setMembershipStatus(request, 'unavailable', details);
    response.status(details.status).json({ error: details });
  }
});

app.get('/api/youtube/live/events', async (request, response) => {
  try {
    const client = getAuthorizedClient(request);
    if (!client) return response.status(401).json({ error: 'not_connected' });

    const liveState = request.session.liveState || {};
    const result = await fetchLiveMembershipEvents(client, liveState.pageToken);
    request.session.liveState = {
      pageToken: result.nextPageToken,
      liveChatId: result.liveChatId,
    };
    response.json(result);
  } catch (error) {
    const details = apiError(error);
    response.status(details.status).json({ error: details });
  }
});

app.get('/api/native/device/roster.txt', async (request, response) => {
  const device = getNativeDevice(request);
  if (!device) return response.status(401).type('text/plain').send('device_unauthorized');

  try {
    const roster = await syncNativeDevice(device);
    response.set('Cache-Control', 'no-store');
    response.type('text/plain').send(rosterText(roster.members));
  } catch (error) {
    const details = apiError(error);
    response
      .status(502)
      .type('text/plain')
      .send(`device_sync_failed: ${details.message}`);
  }
});

app.get(/^(?!\/(?:api|auth|health)(?:\/|$)).*/, (request, response, next) => {
  if (request.method !== 'GET') return next();
  response.sendFile(path.join(frontendDistPath, 'index.html'), (error) => {
    if (error) next(error);
  });
});

const host = process.env.HOST || '127.0.0.1';
app.listen(port, host, () => {
  console.log(`Member Credits API listening at http://${host}:${port}`);
});
