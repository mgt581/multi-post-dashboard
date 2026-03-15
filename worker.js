var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var worker_default = {
  async fetch(request, env) {
    const HARD_DEFAULT_SITE = "https://multipostapp.co.uk";
    const siteBaseUrl = env.BASE_URL || HARD_DEFAULT_SITE;
    const frontendBaseUrl = env.FRONTEND_URL || siteBaseUrl;
    const requestOrigin = request.headers.get("Origin");
    const corsOrigin = requestOrigin || "*";
    const corsHeaders = {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8"
    };
    const json = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: corsHeaders
    }), "json");
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const url = new URL(request.url);
    const requireUser = /* @__PURE__ */ __name((val) => {
      if (!val || typeof val !== "string" || !val.trim()) {
        throw new Error("Missing user_id");
      }
      return val.trim();
    }, "requireUser");
    const nowMs = /* @__PURE__ */ __name(() => Date.now(), "nowMs");
    const safeJson = /* @__PURE__ */ __name(async (res) => {
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { raw: text };
      }
    }, "safeJson");
    const encodeState = /* @__PURE__ */ __name((obj) => {
      try {
        return btoa(JSON.stringify(obj));
      } catch {
        return String(obj?.folderId || "");
      }
    }, "encodeState");
    const decodeState = /* @__PURE__ */ __name((stateStr) => {
      if (!stateStr) {
        return { folderId: null, userId: null, platform: null };
      }
      try {
        return JSON.parse(atob(stateStr));
      } catch {
        return { folderId: stateStr, userId: null, platform: null };
      }
    }, "decodeState");
    const ensureFolderBelongsToUser = /* @__PURE__ */ __name(async (folderId, userId) => {
      const row = await env.DB.prepare(
        "SELECT id, name, user_id FROM folders WHERE id = ? AND user_id = ? LIMIT 1"
      ).bind(folderId, userId).first();
      if (!row) {
        throw new Error("Folder not found or not owned by user");
      }
      return row;
    }, "ensureFolderBelongsToUser");
    const upsertToken = /* @__PURE__ */ __name(async ({
      folderId,
      platform,
      accountId,
      accessToken,
      refreshToken,
      expiresAt,
      scope
    }) => {
      if (!folderId || !platform || !accountId || !accessToken) return;
      await env.DB.prepare(`
        INSERT INTO tokens (
          folder_id,
          platform,
          account_id,
          access_token,
          refresh_token,
          expires_at,
          scope,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s','now'))
        ON CONFLICT(folder_id, platform, account_id)
        DO UPDATE SET
          access_token = excluded.access_token,
          refresh_token = COALESCE(excluded.refresh_token, tokens.refresh_token),
          expires_at = excluded.expires_at,
          scope = excluded.scope,
          updated_at = strftime('%s','now')
      `).bind(
        folderId,
        platform,
        accountId,
        accessToken,
        refreshToken || null,
        expiresAt || null,
        scope || null
      ).run();
    }, "upsertToken");
    const exchangeGoogleCodeForTokens = /* @__PURE__ */ __name(async (code) => {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${siteBaseUrl}/api/auth/callback/youtube`,
          grant_type: "authorization_code"
        })
      });
      const tokens = await safeJson(tokenRes);
      if (!tokenRes.ok || !tokens.access_token) {
        throw new Error(tokens.error_description || tokens.error || "Failed to exchange Google code");
      }
      return tokens;
    }, "exchangeGoogleCodeForTokens");
    const refreshGoogleAccessToken = /* @__PURE__ */ __name(async (refreshToken) => {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token"
        })
      });
      const refreshed = await safeJson(tokenRes);
      if (!tokenRes.ok || !refreshed.access_token) {
        throw new Error(refreshed.error_description || refreshed.error || "Failed to refresh Google token");
      }
      return refreshed;
    }, "refreshGoogleAccessToken");
    const getYouTubeChannel = /* @__PURE__ */ __name(async (accessToken) => {
      const ytRes = await fetch(
        "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }
      );
      const ytData = await safeJson(ytRes);
      if (!ytRes.ok) {
        throw new Error(
          ytData?.error?.message || ytData?.error_description || "Failed to fetch YouTube channel"
        );
      }
      const channel = ytData?.items?.[0];
      if (!channel) {
        throw new Error("No YouTube channel found for this Google account");
      }
      return {
        channelId: channel.id,
        channelName: channel.snippet?.title || "YouTube Channel",
        avatarUrl: channel.snippet?.thumbnails?.default?.url || channel.snippet?.thumbnails?.medium?.url || channel.snippet?.thumbnails?.high?.url || ""
      };
    }, "getYouTubeChannel");
    const getFacebookLoginUrl = /* @__PURE__ */ __name(({ appId, redirectUri, state }) => {
      const scope = [
        "pages_show_list",
        "pages_manage_metadata",
        "pages_read_engagement",
        "pages_manage_posts"
      ].join(",");
      return "https://www.facebook.com/v24.0/dialog/oauth" + `?client_id=${encodeURIComponent(appId)}` + `&redirect_uri=${encodeURIComponent(redirectUri)}` + `&state=${encodeURIComponent(state)}` + "&response_type=code" + `&scope=${encodeURIComponent(scope)}`;
    }, "getFacebookLoginUrl");
    const findExistingAccount = /* @__PURE__ */ __name(async (folderId, userId, platform) => {
      return await env.DB.prepare(
        "SELECT * FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = ? LIMIT 1"
      ).bind(folderId, userId, platform).first();
    }, "findExistingAccount");
    const upsertAccount = /* @__PURE__ */ __name(async ({
      folderId,
      userId,
      platform,
      nickname,
      accessToken,
      refreshToken,
      expiresAt
    }) => {
      const existing = await findExistingAccount(folderId, userId, platform);
      if (existing) {
        await env.DB.prepare(`
          UPDATE accounts
          SET
            nickname = ?,
            access_token = ?,
            refresh_token = COALESCE(?, refresh_token),
            expires_at = ?
          WHERE id = ?
        `).bind(
          nickname,
          accessToken,
          refreshToken || null,
          expiresAt,
          existing.id
        ).run();
        return existing.id;
      }
      const inserted = await env.DB.prepare(`
        INSERT INTO accounts (
          folder_id,
          user_id,
          platform,
          nickname,
          access_token,
          refresh_token,
          expires_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `).bind(
        folderId,
        userId,
        platform,
        nickname,
        accessToken,
        refreshToken || null,
        expiresAt
      ).first();
      return inserted?.id || null;
    }, "upsertAccount");
    const getFolderYoutubeAccount = /* @__PURE__ */ __name(async (folderId, userId) => {
      const row = await env.DB.prepare(
        "SELECT * FROM accounts WHERE folder_id = ? AND user_id = ? AND platform = 'youtube' LIMIT 1"
      ).bind(folderId, userId).first();
      if (!row) {
        throw new Error("No YouTube account connected for this folder");
      }
      return row;
    }, "getFolderYoutubeAccount");
    const refreshYouTubeAccountIfNeeded = /* @__PURE__ */ __name(async (accountRow, folderId) => {
      if (!accountRow || accountRow.platform !== "youtube") {
        return accountRow;
      }
      const expiry = Number(accountRow.expires_at || 0);
      const isExpired = !expiry || nowMs() >= expiry - 60 * 1e3;
      if (!isExpired) {
        return accountRow;
      }
      if (!accountRow.refresh_token) {
        return accountRow;
      }
      const refreshed = await refreshGoogleAccessToken(accountRow.refresh_token);
      const newAccessToken = refreshed.access_token;
      const newRefreshToken = refreshed.refresh_token || accountRow.refresh_token;
      const newExpiresAt = nowMs() + Number(refreshed.expires_in || 3600) * 1e3;
      let liveChannelName = accountRow.nickname;
      let liveChannelId = null;
      try {
        const liveChannel = await getYouTubeChannel(newAccessToken);
        liveChannelName = liveChannel.channelName;
        liveChannelId = liveChannel.channelId;
      } catch {
      }
      await env.DB.prepare(`
        UPDATE accounts
        SET
          nickname = ?,
          access_token = ?,
          refresh_token = ?,
          expires_at = ?
        WHERE id = ?
      `).bind(
        liveChannelName,
        newAccessToken,
        newRefreshToken,
        newExpiresAt,
        accountRow.id
      ).run();
      if (liveChannelId) {
        await upsertToken({
          folderId,
          platform: "youtube",
          accountId: liveChannelId,
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresAt: newExpiresAt,
          scope: "youtube.upload youtube.readonly"
        });
      }
      return {
        ...accountRow,
        nickname: liveChannelName,
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        expires_at: newExpiresAt
      };
    }, "refreshYouTubeAccountIfNeeded");
    const getFreshYouTubeAccessTokenForFolder = /* @__PURE__ */ __name(async (folderId, userId) => {
      const account = await getFolderYoutubeAccount(folderId, userId);
      const refreshedAccount = await refreshYouTubeAccountIfNeeded(account, folderId);
      return refreshedAccount.access_token;
    }, "getFreshYouTubeAccessTokenForFolder");
    const startYouTubeResumableSession = /* @__PURE__ */ __name(async ({
      accessToken,
      title,
      description,
      tags,
      privacyStatus,
      fileSize,
      mimeType
    }) => {
      const metadata = {
        snippet: {
          title,
          description,
          tags,
          categoryId: "22"
        },
        status: {
          privacyStatus: privacyStatus || "private"
        }
      };
      const res = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Length": String(fileSize),
            "X-Upload-Content-Type": mimeType || "application/octet-stream"
          },
          body: JSON.stringify(metadata)
        }
      );
      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(
          err?.error?.message || err?.error_description || "Failed to start YouTube upload session"
        );
      }
      const uploadUrl = res.headers.get("Location");
      if (!uploadUrl) {
        throw new Error("YouTube did not return an upload URL");
      }
      return uploadUrl;
    }, "startYouTubeResumableSession");
    const uploadVideoToYouTube = /* @__PURE__ */ __name(async ({
      uploadUrl,
      accessToken,
      fileBuffer,
      mimeType
    }) => {
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": mimeType || "application/octet-stream",
          "Content-Length": String(fileBuffer.byteLength)
        },
        body: fileBuffer
      });
      const body = await safeJson(res);
      if (!(res.ok || res.status === 201)) {
        throw new Error(
          body?.error?.message || body?.error_description || "YouTube upload failed"
        );
      }
      return body;
    }, "uploadVideoToYouTube");
    try {
      if (url.pathname === "/api/health") {
        return json({
          success: true,
          app: "multipost-worker",
          time: nowMs()
        });
      }
      if (url.pathname === "/api/get-folders" && request.method === "GET") {
        const userId = requireUser(url.searchParams.get("user_id"));
        const { results } = await env.DB.prepare(
          "SELECT * FROM folders WHERE user_id = ? ORDER BY created_at DESC, id DESC"
        ).bind(userId).all();
        return json(results || []);
      }
      if (url.pathname === "/api/add-folder" && request.method === "POST") {
        const body = await request.json();
        const name = String(body?.name || "").trim();
        const userId = requireUser(body?.user_id);
        if (!name) {
          return json({ success: false, error: "Folder name is required" }, 400);
        }
        await env.DB.prepare(
          "INSERT INTO folders (name, user_id) VALUES (?, ?)"
        ).bind(name, userId).run();
        return json({ success: true });
      }
      if (url.pathname === "/api/rename-folder" && request.method === "POST") {
        const body = await request.json();
        const id = String(body?.id || "").trim();
        const name = String(body?.name || "").trim();
        const userId = requireUser(body?.user_id);
        if (!id || !name) {
          return json({ success: false, error: "Missing id or name" }, 400);
        }
        await env.DB.prepare(
          "UPDATE folders SET name = ? WHERE id = ? AND user_id = ?"
        ).bind(name, id, userId).run();
        return json({ success: true });
      }
      if (url.pathname === "/api/delete-folder" && request.method === "POST") {
        const body = await request.json();
        const id = String(body?.id || "").trim();
        const type = String(body?.type || "").trim();
        const userId = requireUser(body?.user_id);
        if (!id) {
          return json({ success: false, error: "Missing id" }, 400);
        }
        if (type === "account_only") {
          const account = await env.DB.prepare(
            "SELECT * FROM accounts WHERE id = ? AND user_id = ? LIMIT 1"
          ).bind(id, userId).first();
          if (!account) {
            return json({ success: false, error: "Account not found" }, 404);
          }
          await env.DB.prepare(
            "DELETE FROM accounts WHERE id = ? AND user_id = ?"
          ).bind(id, userId).run();
          await env.DB.prepare(
            "DELETE FROM tokens WHERE folder_id = ? AND platform = ?"
          ).bind(account.folder_id, account.platform).run();
          return json({ success: true });
        }
        await env.DB.prepare(
          "DELETE FROM folders WHERE id = ? AND user_id = ?"
        ).bind(id, userId).run();
        await env.DB.prepare(
          "DELETE FROM accounts WHERE folder_id = ? AND user_id = ?"
        ).bind(id, userId).run();
        await env.DB.prepare(
          "DELETE FROM tokens WHERE folder_id = ?"
        ).bind(id).run();
        return json({ success: true });
      }
      if (url.pathname === "/api/get-accounts" && request.method === "GET") {
        const folderId = String(url.searchParams.get("folder_id") || "").trim();
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!folderId) {
          return json({ success: false, error: "Missing folder_id" }, 400);
        }
        await ensureFolderBelongsToUser(folderId, userId);
        const rowsResult = await env.DB.prepare(
          "SELECT * FROM accounts WHERE folder_id = ? AND user_id = ? ORDER BY id DESC"
        ).bind(folderId, userId).all();
        const rows = rowsResult.results || [];
        const refreshedRows = [];
        for (const row of rows) {
          if (row.platform === "youtube") {
            const updatedRow = await refreshYouTubeAccountIfNeeded(row, folderId);
            refreshedRows.push(updatedRow);
          } else {
            refreshedRows.push(row);
          }
        }
        return json(refreshedRows);
      }
      if (url.pathname === "/api/auth/youtube" && request.method === "GET") {
        const folderId = String(url.searchParams.get("folder_id") || "").trim();
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!folderId) {
          return json({ success: false, error: "Missing folder_id" }, 400);
        }
        await ensureFolderBelongsToUser(folderId, userId);
        const state = encodeState({
          folderId,
          userId,
          platform: "youtube"
        });
        const redirect = `${siteBaseUrl}/api/auth/callback/youtube`;
        const scope = [
          "https://www.googleapis.com/auth/youtube.readonly",
          "https://www.googleapis.com/auth/youtube.upload"
        ].join(" ");
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(env.GOOGLE_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent&include_granted_scopes=true&state=${encodeURIComponent(state)}`;
        return Response.redirect(authUrl, 302);
      }
      if (url.pathname === "/api/auth/facebook" && request.method === "GET") {
        const folderId = String(url.searchParams.get("folder_id") || "").trim();
        const userId = requireUser(url.searchParams.get("user_id"));
        if (!folderId) {
          return json({ success: false, error: "Missing folder_id" }, 400);
        }
        await ensureFolderBelongsToUser(folderId, userId);
        const state = encodeState({
          folderId,
          userId,
          platform: "facebook"
        });
        const redirectUri = `${siteBaseUrl}/api/auth/callback/facebook`;
        const authUrl = getFacebookLoginUrl({
          appId: env.FACEBOOK_APP_ID,
          redirectUri,
          state
        });
        return Response.redirect(authUrl, 302);
      }
      if (url.pathname === "/api/auth/callback/youtube" && request.method === "GET") {
        const code = String(url.searchParams.get("code") || "").trim();
        const state = decodeState(url.searchParams.get("state"));
        if (!code) {
          return Response.redirect(
            `${frontendBaseUrl}/folder.html?id=${state.folderId || ""}&youtube_error=missing_code`,
            302
          );
        }
        if (!state?.folderId || !state?.userId) {
          return Response.redirect(
            `${frontendBaseUrl}/app.html?youtube_error=missing_state`,
            302
          );
        }
        await ensureFolderBelongsToUser(state.folderId, state.userId);
        const tokens = await exchangeGoogleCodeForTokens(code);
        const accessToken = tokens.access_token;
        const refreshToken = tokens.refresh_token || null;
        const expiresAt = nowMs() + Number(tokens.expires_in || 3600) * 1e3;
        const channel = await getYouTubeChannel(accessToken);
        await upsertAccount({
          folderId: state.folderId,
          userId: state.userId,
          platform: "youtube",
          nickname: channel.channelName,
          accessToken,
          refreshToken,
          expiresAt
        });
        await env.DB.prepare(
          "DELETE FROM tokens WHERE folder_id = ? AND platform = ?"
        ).bind(state.folderId, "youtube").run();
        await upsertToken({
          folderId: state.folderId,
          platform: "youtube",
          accountId: channel.channelId,
          accessToken,
          refreshToken,
          expiresAt,
          scope: tokens.scope || "youtube.upload youtube.readonly"
        });
        return Response.redirect(
          `${frontendBaseUrl}/folder.html?id=${encodeURIComponent(state.folderId)}&youtube_connected=1`,
          302
        );
      }
      if (url.pathname === "/api/youtube/upload" && request.method === "POST") {
        const form = await request.formData();
        const folderId = String(form.get("folder_id") || "").trim();
        const userId = requireUser(String(form.get("user_id") || "").trim());
        const title = String(form.get("title") || "").trim();
        const description = String(form.get("description") || "").trim();
        const keywordsRaw = String(form.get("keywords") || "").trim();
        const privacyStatus = String(form.get("privacyStatus") || "private").trim();
        const file = form.get("video");
        if (!folderId) {
          return json({ success: false, error: "Missing folder_id" }, 400);
        }
        if (!title) {
          return json({ success: false, error: "Missing title" }, 400);
        }
        if (!(file instanceof File)) {
          return json({ success: false, error: "Missing video file" }, 400);
        }
        await ensureFolderBelongsToUser(folderId, userId);
        const maxBytes = 500 * 1024 * 1024;
        if (file.size > maxBytes) {
          return json({
            success: false,
            error: "Video too large. Current limit is 500MB."
          }, 400);
        }
        const accessToken = await getFreshYouTubeAccessTokenForFolder(folderId, userId);
        const tags = keywordsRaw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 20);
        const uploadUrl = await startYouTubeResumableSession({
          accessToken,
          title,
          description,
          tags,
          privacyStatus,
          fileSize: file.size,
          mimeType: file.type || "application/octet-stream"
        });
        const fileBuffer = await file.arrayBuffer();
        const uploaded = await uploadVideoToYouTube({
          uploadUrl,
          accessToken,
          fileBuffer,
          mimeType: file.type || "application/octet-stream"
        });
        const videoId = uploaded?.id || null;
        return json({
          success: true,
          videoId,
          youtubeUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
          data: uploaded
        });
      }
      if (url.pathname === "/api/generate-seo" && request.method === "POST") {
        const body = await request.json();
        const prompt = String(body?.prompt || "").trim();
        if (!prompt) {
          return json({ success: false, error: "Prompt is required" }, 400);
        }
        const aiResponse = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
          messages: [
            {
              role: "system",
              content: `You are a viral social media SEO expert.

Return JSON with this shape:
{
  "youtube": {
    "title": "...",
    "description": "...",
    "keywords": ["...", "...", "..."]
  },
  "tiktok": {
    "allInOne": "..."
  },
  "facebook": {
    "title": "...",
    "descriptionAndTags": "..."
  }
}

Make it catchy, clickable, SEO-friendly and useful for short-form video creators.`
            },
            {
              role: "user",
              content: prompt
            }
          ]
        });
        return json({ success: true, data: aiResponse });
      }
      if (!url.pathname.startsWith("/api/")) {
        return Response.redirect(frontendBaseUrl, 302);
      }
      return json({ success: false, error: "Not Found" }, 404);
    } catch (err) {
      return json(
        {
          success: false,
          error: err?.message || "Unknown server error"
        },
        500
      );
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
