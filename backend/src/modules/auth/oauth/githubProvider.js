class GithubProvider {
  constructor({ clientId, clientSecret, redirectUri }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
  }

  getAuthUrl(state) {
    if (!this.clientId || !this.redirectUri) {
      throw new Error('GitHub OAuth no está configurado');
    }

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'read:user user:email',
      state,
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async getProfile(code) {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new Error('GitHub OAuth no está configurado');
    }

    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.redirectUri,
        }),
      }
    );
    if (!tokenResponse.ok) throw new Error('GitHub no pudo emitir el token');

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || 'Código OAuth rechazado');
    }

    const headers = {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Battle-Arena',
    };

    const userResponse = await fetch('https://api.github.com/user', { headers });
    if (!userResponse.ok) throw new Error('GitHub no pudo obtener el perfil');
    const profile = await userResponse.json();

    const emailsResponse = await fetch('https://api.github.com/user/emails', {
      headers,
    });
    if (!emailsResponse.ok) throw new Error('GitHub no pudo obtener el correo');
    const emails = await emailsResponse.json();
    const primaryVerified = emails.find(
      (item) => item.primary && item.verified
    );

    return {
      providerUserId: String(profile.id),
      login: profile.login,
      email: primaryVerified ? primaryVerified.email.toLowerCase() : null,
    };
  }
}

module.exports = { GithubProvider };
