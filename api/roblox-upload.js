/**
 * FH Audio - Vercel Serverless Roblox Asset Upload Bridge
 * Uploads audio directly to Roblox Open Cloud Assets API.
 */

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const apiKey = data.apiKey || '';
    const assetName = data.assetName || 'Audio';
    const creatorType = data.creatorType || 'userId';
    let creatorId = String(data.creatorId || '0');
    const audioBase64 = data.audioBase64 || '';

    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'Missing API Key' });
    }

    const cField = (String(creatorType).toLowerCase() === 'group' || String(creatorType).toLowerCase() === 'groupid')
      ? 'groupId'
      : 'userId';

    // Auto-extract ownerId if creatorId is empty and type is user
    if ((!creatorId || creatorId === '0') && cField === 'userId') {
      try {
        const mJwt = apiKey.match(/(eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+)/);
        if (mJwt) {
          const parts = mJwt[1].split('.');
          if (parts.length >= 2) {
            const pad = parts[1].length % 4;
            const b64 = parts[1] + (pad ? '='.repeat(4 - pad) : '');
            const payload = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
            if (payload && payload.ownerId) {
              creatorId = String(payload.ownerId);
            }
          }
        }
      } catch (_) {}
    }

    const audioBuf = audioBase64 ? Buffer.from(audioBase64, 'base64') : Buffer.alloc(0);

    let mimeType = 'audio/ogg';
    let ext = 'ogg';
    if (audioBuf.length > 2 && (audioBuf[0] === 0xFF && (audioBuf[1] & 0xE0) === 0xE0 || audioBuf.toString('ascii', 0, 3) === 'ID3')) {
      mimeType = 'audio/mpeg';
      ext = 'mp3';
    }

    const metaObj = {
      assetType: 'Audio',
      displayName: assetName.slice(0, 50),
      description: 'In-game background audio and atmospheric music',
      creationContext: {
        creator: {
          [cField]: String(creatorId)
        }
      }
    };

    const form = new FormData();
    form.append('request', JSON.stringify(metaObj));
    form.append('fileContent', new Blob([audioBuf], { type: mimeType }), `audio.${ext}`);

    const uploadRes = await fetch('https://apis.roblox.com/assets/v1/assets', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey
      },
      body: form
    });

    const respText = await uploadRes.text();
    let respJson = null;
    try {
      respJson = JSON.parse(respText);
    } catch (_) {}

    if (!uploadRes.ok) {
      const errMsg = (respJson && (respJson.message || respJson.error)) || respText || 'Roblox API upload rejected';
      return res.status(uploadRes.status || 400).json({ success: false, error: errMsg });
    }

    const opPath = respJson && (respJson.path || respJson.operationId ? (respJson.path || `operations/${respJson.operationId}`) : '');
    if (!opPath) {
      return res.status(400).json({ success: false, error: respText || 'No operation path returned' });
    }

    // Initial polling check for completion
    let assetId = '';
    let modStatus = 'reviewing';

    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const chkRes = await fetch(`https://apis.roblox.com/assets/v1/${opPath}`, {
          headers: { 'x-api-key': apiKey }
        });
        if (chkRes.ok) {
          const chkJson = await chkRes.json();
          if (chkJson.done) {
            if (chkJson.error) {
              return res.status(200).json({
                success: false,
                error: chkJson.error.message || 'Upload rejected by Roblox',
                status: 'rejected',
                operationPath: opPath
              });
            }

            const respObj = chkJson.response || {};
            assetId = String(respObj.assetId || '').trim();
            const rawMod = (respObj.moderationResult && respObj.moderationResult.moderationState) || '';
            const rawLower = rawMod.toLowerCase();

            if (rawLower.includes('approved')) {
              modStatus = 'approved';
            } else if (rawLower.includes('rejected') || rawLower.includes('blocked')) {
              modStatus = 'rejected';
            } else {
              modStatus = 'reviewing';
            }
            break;
          }
        }
      } catch (_) {}
    }

    return res.status(200).json({
      success: true,
      assetId,
      status: modStatus,
      operationPath: opPath
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};
