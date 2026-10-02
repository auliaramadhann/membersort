import { type ChangeEvent, useEffect, useState } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '';

type Tier = {
  name: string;
  members: string;
};

type YouTubeMember = {
  displayName: string | null;
  levelName: string | null;
};

type YouTubeStatus = {
  connected: boolean;
  channel?: { id?: string; title: string } | null;
};

type LayoutMode = 'credit-roll' | 'bottom-ticker';
type TextAlign = 'left' | 'center' | 'right';

type CreditsConfig = {
  kicker: string;
  title: string;
  footer: string;
  fontSize: number;
  speed: number;
  layoutMode: LayoutMode;
  textAlign: TextAlign;
  font: 'casual' | 'rounded' | 'clean';
  accent: string;
  textColor: string;
  footerColor: string;
  transparentBackground: boolean;
  backgroundColor: string;
  tiers: Tier[];
};

const defaultConfig: CreditsConfig = {
  kicker: 'MEMBER ROLL CALL',
  title: 'Special Thanks',
  footer: 'Thank you for keeping this channel alive.',
  fontSize: 34,
  speed: 45,
  layoutMode: 'credit-roll',
  textAlign: 'center',
  font: 'casual',
  accent: '#91a88b',
  textColor: '#292824',
  footerColor: '#6c6a62',
  transparentBackground: false,
  backgroundColor: '#faf9f5',
  tiers: [
    { name: 'Founding Supporters', members: 'Astra Nox\nMio Kisaragi' },
    { name: 'Moonlight Members', members: 'Kuma\nRinSora\nNeonMikan' },
    { name: 'Starlight Members', members: 'Bubu Boba\nFia\nYukiTan' },
  ],
};

function encodeConfig(config: CreditsConfig) {
  return window.btoa(encodeURIComponent(JSON.stringify(config)));
}

function decodeConfig(value: string | null): CreditsConfig {
  if (!value) return defaultConfig;

  try {
    const parsed = JSON.parse(decodeURIComponent(window.atob(value))) as CreditsConfig;
    if (!Array.isArray(parsed.tiers)) return defaultConfig;
    return { ...defaultConfig, ...parsed };
  } catch {
    return defaultConfig;
  }
}

function membersFromText(members: string) {
  return members
    .split('\n')
    .map((member) => member.trim())
    .filter(Boolean);
}

function memberNames(config: CreditsConfig) {
  return config.tiers.flatMap((tier) => membersFromText(tier.members));
}

function Credits({
  config,
  preview = false,
  playing = false,
  started = false,
  resetKey = 0,
}: {
  config: CreditsConfig;
  preview?: boolean;
  playing?: boolean;
  started?: boolean;
  resetKey?: number;
}) {
  const style = {
    '--accent': config.accent,
    '--text-color': config.textColor,
    '--footer-color': config.footerColor,
    '--paper-color': config.backgroundColor,
    '--member-font':
      config.font === 'casual'
        ? "'Nunito', sans-serif"
        : config.font === 'rounded'
          ? "'DM Sans', sans-serif"
          : 'system-ui, sans-serif',
    '--heading-font':
      config.font === 'casual'
        ? "'Kalam', cursive"
        : config.font === 'rounded'
          ? "'Nunito', sans-serif"
          : "'DM Sans', sans-serif",
    textAlign: config.textAlign,
  } as React.CSSProperties;

  const tickerText = memberNames(config).join('  |  ');

  const content = (
    <div className="credits-content" style={style}>
      <p className="credits-kicker">{config.kicker}</p>
      <h1>{config.title}</h1>
      <div className="credits-rule" />
      {config.tiers.map((tier, index) => {
        const members = membersFromText(tier.members);
        if (!tier.name || !members.length) return null;

        return (
          <section className="credit-tier" key={`${tier.name}-${index}`}>
            <h2>{tier.name}</h2>
            {members.map((member) => (
              <p key={member}>{member}</p>
            ))}
          </section>
        );
      })}
      <div className="credits-rule" />
      <p className="credits-footer">{config.footer}</p>
    </div>
  );

  if (preview) {
    if (config.layoutMode === 'bottom-ticker') {
      return (
        <div
          className={`credits-preview is-ticker ${config.transparentBackground ? 'is-transparent' : ''}`}
          style={style}
        >
          <div
            className={`preview-ticker-shell ${config.transparentBackground ? 'is-transparent' : ''}`}
          >
            <div
              className={`ticker-track ticker-align-${config.textAlign}`}
              key={resetKey}
              style={
                {
                  '--ticker-duration': `${config.speed}s`,
                  animationPlayState: playing ? 'running' : 'paused',
                  fontSize: `${config.fontSize}px`,
                } as React.CSSProperties
              }
            >
              <span>{tickerText}</span>
              <span aria-hidden="true">{tickerText}</span>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        className={`credits-preview ${config.transparentBackground ? 'is-transparent' : ''}`}
        style={style}
      >
        <div
          className={`preview-roll ${started ? 'is-started' : ''} ${playing ? 'is-playing' : ''}`}
          key={resetKey}
          style={
            {
              '--preview-duration': `${config.speed}s`,
              fontSize: `${config.fontSize}px`,
            } as React.CSSProperties
          }
        >
          {content}
        </div>
      </div>
    );
  }

  if (config.layoutMode === 'bottom-ticker') {
    return (
      <main
        className={`overlay-canvas bottom-ticker ${config.transparentBackground ? 'is-transparent' : ''}`}
        style={{ ...style, backgroundColor: 'transparent' } as React.CSSProperties}
      >
        <div
          className={`ticker-shell ${config.transparentBackground ? 'is-transparent' : ''}`}
        >
          <div
            className={`ticker-track ticker-align-${config.textAlign}`}
            style={
              {
                '--ticker-duration': `${config.speed}s`,
                animationPlayState: playing ? 'running' : 'paused',
                fontSize: `${config.fontSize}px`,
              } as React.CSSProperties
            }
          >
            <span>{tickerText}</span>
            <span aria-hidden="true">{tickerText}</span>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      className={`overlay-canvas credit-roll ${config.transparentBackground ? 'is-transparent' : ''}`}
      style={
        {
          ...style,
          '--roll-duration': `${config.speed}s`,
          backgroundColor: config.transparentBackground
            ? 'transparent'
            : config.backgroundColor,
        } as React.CSSProperties
      }
    >
      <div
        className="credits-roll"
        style={{
          fontSize: `${config.fontSize}px`,
          animationPlayState: playing ? 'running' : 'paused',
        }}
      >
        {content}
      </div>
    </main>
  );
}

function Overlay() {
  const params = new URLSearchParams(window.location.search);
  const config = decodeConfig(params.get('config'));
  return <Credits config={config} playing />;
}

function Dashboard() {
  const [config, setConfig] = useState(defaultConfig);
  const [copied, setCopied] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewStarted, setPreviewStarted] = useState(false);
  const [previewResetKey, setPreviewResetKey] = useState(0);
  const [youtubeStatus, setYoutubeStatus] = useState<YouTubeStatus>({ connected: false });
  const [youtubeMessage, setYoutubeMessage] = useState('');
  const [youtubeLoading, setYoutubeLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthResult = params.get('oauth');
    const oauthMessage = params.get('message');
    if (oauthResult === 'error')
      setYoutubeMessage(oauthMessage || 'Google connection failed.');
    if (oauthResult === 'connected') setYoutubeMessage('Google account connected.');

    fetch(`${API_BASE}/api/auth/status`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Local API is not running.');
        return response.json() as Promise<YouTubeStatus>;
      })
      .then(setYoutubeStatus)
      .catch(() => setYoutubeMessage('Start the local API to connect YouTube.'));
  }, []);

  const updateConfig = <Key extends keyof CreditsConfig>(
    key: Key,
    value: CreditsConfig[Key],
  ) => {
    setConfig((current) => ({ ...current, [key]: value }));
  };

  const updateTier = (index: number, key: keyof Tier, value: string) => {
    setConfig((current) => ({
      ...current,
      tiers: current.tiers.map((tier, tierIndex) =>
        tierIndex === index ? { ...tier, [key]: value } : tier,
      ),
    }));
  };

  const overlayUrl = `${window.location.origin}/overlay?trigger=scene&config=${encodeURIComponent(encodeConfig(config))}`;

  const copyOverlayUrl = async () => {
    await navigator.clipboard.writeText(overlayUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const connectYouTube = () => {
    window.location.href = `${API_BASE}/auth/google`;
  };

  const importYouTubeMembers = async () => {
    setYoutubeLoading(true);
    setYoutubeMessage('Checking membership access...');
    try {
      const response = await fetch(`${API_BASE}/api/youtube/test`, {
        credentials: 'include',
      });
      const payload = (await response.json()) as {
        count?: number;
        members?: YouTubeMember[];
        error?: { reason?: string; message?: string };
      };
      if (!response.ok) {
        throw new Error(
          `${payload.error?.reason || 'api_error'}: ${payload.error?.message || ''}`,
        );
      }

      const groups = new Map<string, string[]>();
      for (const member of payload.members || []) {
        if (!member.displayName) continue;
        const groupName = member.levelName || 'YouTube Members';
        groups.set(groupName, [...(groups.get(groupName) || []), member.displayName]);
      }
      const importedTiers = [...groups].map(([name, members]) => ({
        name,
        members: members.join('\n'),
      }));
      if (importedTiers.length)
        setConfig((current) => ({ ...current, tiers: importedTiers }));
      setYoutubeMessage(`${payload.count || 0} members imported.`);
    } catch (error) {
      setYoutubeMessage(error instanceof Error ? error.message : 'Member sync failed.');
    } finally {
      setYoutubeLoading(false);
    }
  };

  const exportYouTubeRoster = async () => {
    setYoutubeLoading(true);
    setYoutubeMessage('Preparing the native OBS roster...');
    try {
      const response = await fetch(`${API_BASE}/api/youtube/roster.txt`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message || 'Roster export failed.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'member-roster.txt';
      link.click();
      URL.revokeObjectURL(url);
      setYoutubeMessage(
        'Roster downloaded. Load it from the native OBS source properties.',
      );
    } catch (error) {
      setYoutubeMessage(error instanceof Error ? error.message : 'Roster export failed.');
    } finally {
      setYoutubeLoading(false);
    }
  };

  return (
    <main className="dashboard">
      <header className="topbar">
        <a className="brand" href="/">
          <span>MC</span>
          Member Credits
        </a>
        <button className="youtube-connect" type="button" onClick={connectYouTube}>
          {youtubeStatus.connected
            ? `Connected: ${youtubeStatus.channel?.title || 'YouTube'}`
            : 'Connect YouTube'}
        </button>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">For the people who stay until the end</p>
          <h1>Make your members feel a little more special.</h1>
          <p className="intro">
            A calm, easy place to shape your end-credit roll before the next stream.
          </p>
        </div>
        <div className="member-count">
          <strong>
            {config.tiers.reduce(
              (count, tier) => count + membersFromText(tier.members).length,
              0,
            )}
          </strong>
          <span>friends in this roll</span>
        </div>
      </section>

      <section className="workspace">
        <aside className="controls">
          <div className="control-heading">
            <p className="eyebrow">Your credits</p>
            <h2>Play around with it</h2>
          </div>

          <label>
            Credit kicker
            <input
              value={config.kicker}
              onChange={(event) => updateConfig('kicker', event.target.value)}
            />
          </label>
          <label>
            Credit title
            <input
              value={config.title}
              onChange={(event) => updateConfig('title', event.target.value)}
            />
          </label>
          <label>
            Closing message
            <input
              value={config.footer}
              onChange={(event) => updateConfig('footer', event.target.value)}
            />
          </label>

          <div className="display-controls">
            <label>
              Display mode
              <select
                value={config.layoutMode}
                onChange={(event) =>
                  updateConfig('layoutMode', event.target.value as LayoutMode)
                }
              >
                <option value="credit-roll">Credit roll</option>
                <option value="bottom-ticker">Bottom ticker</option>
              </select>
            </label>
            <label>
              Text alignment
              <select
                value={config.textAlign}
                onChange={(event) =>
                  updateConfig('textAlign', event.target.value as TextAlign)
                }
              >
                <option value="left">Left</option>
                <option value="center">Center / Middle</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>

          <div className="range-row">
            <label>
              Font size <output>{config.fontSize}px</output>
              <input
                type="range"
                min="22"
                max="58"
                value={config.fontSize}
                onChange={(event) => updateConfig('fontSize', Number(event.target.value))}
              />
            </label>
            <label>
              {config.layoutMode === 'bottom-ticker' ? 'Ticker cycle' : 'Roll time'}{' '}
              <output>{config.speed}s</output>
              <input
                type="range"
                min="20"
                max="120"
                value={config.speed}
                onChange={(event) => updateConfig('speed', Number(event.target.value))}
              />
            </label>
          </div>

          <label className="color-label">
            Accent color
            <input
              type="color"
              value={config.accent}
              onChange={(event) => updateConfig('accent', event.target.value)}
            />
          </label>

          <div className="appearance-controls">
            <div className="tier-editor-title">
              <span>Appearance</span>
              <small>Shown in OBS</small>
            </div>
            <label>
              Font style
              <select
                value={config.font}
                onChange={(event) =>
                  updateConfig('font', event.target.value as CreditsConfig['font'])
                }
              >
                <option value="casual">Casual handwritten</option>
                <option value="rounded">Rounded modern</option>
                <option value="clean">Clean system</option>
              </select>
            </label>
            <div className="color-grid">
              <label>
                Member text
                <input
                  type="color"
                  value={config.textColor}
                  onChange={(event) => updateConfig('textColor', event.target.value)}
                />
              </label>
              <label>
                Footer text
                <input
                  type="color"
                  value={config.footerColor}
                  onChange={(event) => updateConfig('footerColor', event.target.value)}
                />
              </label>
            </div>
            <div className="background-toggle">
              <div>
                <strong>Transparent background</strong>
                <small>Use for a clean OBS overlay</small>
              </div>
              <label className="switch" aria-label="Transparent background">
                <input
                  type="checkbox"
                  checked={config.transparentBackground}
                  onChange={(event) =>
                    updateConfig('transparentBackground', event.target.checked)
                  }
                />
                <span />
              </label>
            </div>
            {!config.transparentBackground && (
              <label className="color-label background-color">
                Paper color
                <input
                  type="color"
                  value={config.backgroundColor}
                  onChange={(event) =>
                    updateConfig('backgroundColor', event.target.value)
                  }
                />
              </label>
            )}
          </div>

          <div className="tier-editor">
            <div className="tier-editor-title">
              <span>Member tiers</span>
              <small>One name per line</small>
            </div>
            {config.tiers.map((tier, index) => (
              <div className="tier-fields" key={index}>
                <input
                  aria-label={`Tier ${index + 1} name`}
                  value={tier.name}
                  onChange={(event) => updateTier(index, 'name', event.target.value)}
                />
                <textarea
                  aria-label={`${tier.name} members`}
                  value={tier.members}
                  onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
                    updateTier(index, 'members', event.target.value)
                  }
                />
              </div>
            ))}
          </div>
          <div className="youtube-panel">
            <div className="tier-editor-title">
              <span>YouTube members</span>
              <small>
                {youtubeStatus.connected ? 'Connected' : 'Manual data for now'}
              </small>
            </div>
            <p>{youtubeMessage || 'Connect your channel to test membership access.'}</p>
            <div className="youtube-actions">
              <button type="button" onClick={connectYouTube}>
                {youtubeStatus.connected ? 'Reconnect channel' : 'Connect channel'}
              </button>
              <button
                type="button"
                disabled={!youtubeStatus.connected || youtubeLoading}
                onClick={importYouTubeMembers}
              >
                {youtubeLoading ? 'Checking...' : 'Test & import members'}
              </button>
              <button
                type="button"
                disabled={!youtubeStatus.connected || youtubeLoading}
                onClick={exportYouTubeRoster}
              >
                Export native roster
              </button>
            </div>
          </div>
        </aside>

        <div className="preview-panel">
          <div className="preview-header">
            <div>
              <p className="eyebrow">A little preview</p>
              <h2>How it will look on stream</h2>
            </div>
            <span className="live-dot">Looking good</span>
          </div>
          <Credits
            config={config}
            preview
            playing={previewPlaying}
            started={previewStarted}
            resetKey={previewResetKey}
          />
          <div className="preview-controls" aria-label="Preview playback controls">
            <button
              className={previewPlaying ? 'is-active' : ''}
              type="button"
              onClick={() => {
                setPreviewStarted(true);
                setPreviewPlaying(true);
              }}
            >
              <span aria-hidden="true">▶</span> Play
            </button>
            <button
              className={previewStarted && !previewPlaying ? 'is-active' : ''}
              type="button"
              onClick={() => setPreviewPlaying(false)}
            >
              <span aria-hidden="true">Ⅱ</span> Pause
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewPlaying(false);
                setPreviewStarted(false);
                setPreviewResetKey((key) => key + 1);
              }}
            >
              <span aria-hidden="true">■</span> Stop
            </button>
            <button
              type="button"
              onClick={() => {
                setPreviewStarted(true);
                setPreviewResetKey((key) => key + 1);
                setPreviewPlaying(true);
              }}
            >
              <span aria-hidden="true">↺</span> Reset
            </button>
          </div>
          <div className="overlay-action">
            <div>
              <strong>All set for OBS</strong>
              <p>Copy the link, then paste it into an OBS Browser Source.</p>
            </div>
            <button type="button" onClick={copyOverlayUrl}>
              {copied ? 'Copied URL' : 'Copy overlay URL'}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

export function App() {
  return window.location.pathname.startsWith('/overlay') ? <Overlay /> : <Dashboard />;
}
