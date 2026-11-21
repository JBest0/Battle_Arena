const crypto = require('crypto');

function parseCookies(header) {
  const cookies = {};
  for (const pair of String(header || '').split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

class OauthController {
  constructor({ oauthService, config }) {
    this.oauthService = oauthService;
    this.config = config;
  }

  githubStart(req, res) {
    const state = this.oauthService.createState();
    res.cookie('oauth_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.nodeEnv === 'production',
      maxAge: 10 * 60 * 1000,
    });

    try {
      return res.redirect(this.oauthService.getAuthUrl(state));
    } catch (err) {
      return res.redirect(
        `${this.config.frontendUrl}/login?oauthError=PROVIDER_ERROR`
      );
    }
  }

  async githubCallback(req, res) {
    const frontendLogin = `${this.config.frontendUrl}/login`;

    if (req.query.error === 'access_denied') {
      res.clearCookie('oauth_state');
      return res.redirect(`${frontendLogin}?oauthError=ACCESS_DENIED`);
    }

    const cookies = parseCookies(req.headers.cookie);
    const state = req.query.state;
    const cookieState = cookies.oauth_state;
    if (
      !state ||
      !cookieState ||
      String(state).length !== cookieState.length ||
      !crypto.timingSafeEqual(
        Buffer.from(String(state)),
        Buffer.from(cookieState)
      )
    ) {
      res.clearCookie('oauth_state');
      return res.redirect(`${frontendLogin}?oauthError=STATE_INVALID`);
    }
    res.clearCookie('oauth_state');

    if (!req.query.code) {
      return res.redirect(`${frontendLogin}?oauthError=PROVIDER_ERROR`);
    }

    try {
      const { accessToken } = await this.oauthService.loginWithCode(
        String(req.query.code)
      );
      return res.redirect(
        `${this.config.frontendUrl}/oauth/callback#token=${encodeURIComponent(accessToken)}`
      );
    } catch (err) {
      const code =
        err && err.code === 'EMAIL_NOT_VERIFIED'
          ? 'EMAIL_NOT_VERIFIED'
          : 'PROVIDER_ERROR';
      return res.redirect(`${frontendLogin}?oauthError=${code}`);
    }
  }
}

module.exports = { OauthController, parseCookies };
