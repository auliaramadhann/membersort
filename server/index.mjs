import crypto from 'node:crypto';
import fs from 'node:fs';
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
      scope: [membershipScope],
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
    request.session.tokens = tokens;
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

    response.json({
      levels,
      members,
      count: members.length,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const details = apiError(error);
    response.status(details.status).json({ error: details });
  }
});

app.listen(port, () => {
  console.log(`Member Credits API listening at http://localhost:${port}`);
});
