import type { Request, Response } from 'express';

/**
 * Controller for handling social media sharing bridge
 * This serves HTML with Open Graph tags for dynamic previews
 */
export const getShareBridge = (req: Request, res: Response) => {
  const { image, score, game } = req.query;
  const userAgent = String(req.headers['user-agent'] || '').toLowerCase();

  const escapeHtml = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // Validate that we have an image URL
  if (!image || typeof image !== 'string') {
    // If no image provided, redirect to home
    const frontendUrl = process.env.FRONTEND_URL || 'https://sibolsprout.netlify.app/';
    return res.redirect(frontendUrl);
  }

  const scoreText = score ? `I scored ${score} points!` : 'Check out my achievement!';
  const gameName = game === 'matching' ? 'Matching Game' : 'SIBOL Games';
  const frontendUrl = `${process.env.FRONTEND_URL || 'https://sibolsprout.netlify.app/'}?share=${game || 'game'}&score=${score || '0'}`;

  const safeGameName = escapeHtml(gameName);
  const safeScoreText = escapeHtml(scoreText);
  const safeImage = escapeHtml(image);
  const safeOgUrl = escapeHtml(`${process.env.BACKEND_URL || ''}${req.originalUrl}`);
  const safeFrontendUrl = escapeHtml(frontendUrl);
  const isCrawler = /(facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|discordbot|whatsapp|telegrambot)/i.test(userAgent);

  const redirectBlock = isCrawler
    ? ''
    : `
    <!-- Redirect to Frontend -->
    <meta http-equiv="refresh" content="0;url=${safeFrontendUrl}" />`;

  const scriptRedirect = isCrawler
    ? ''
    : `
    <script>
        // Backup JavaScript redirect for human visitors
        setTimeout(function() {
          window.location.href = "${safeFrontendUrl}";
        }, 100);
    </script>`;

  // Simple HTML bridge with OG tags
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- Open Graph Metadata -->
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${safeGameName} - SIBOL" />
    <meta property="og:description" content="${safeScoreText} Join me in learning about sustainable waste management with SIBOL!" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:secure_url" content="${safeImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${safeGameName} score card" />
    <meta property="og:url" content="${safeOgUrl}" />
    
    <!-- Twitter Metadata -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${safeGameName} - SIBOL">
    <meta name="twitter:description" content="${safeScoreText}">
    <meta name="twitter:image" content="${safeImage}">

    ${redirectBlock}
    
    <title>SIBOL Game Share</title>
    <style>
        body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f4f4f4; color: #333; }
        .loading { text-align: center; }
        .spinner { border: 4px solid rgba(0,0,0,0.1); border-left-color: #2e7d32; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="loading">
        <div class="spinner"></div>
        <p>Redirecting to SIBOL...</p>
    </div>
    ${scriptRedirect}
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
};
