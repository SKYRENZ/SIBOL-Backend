import { Router } from 'express';
import { analyzeWater } from '../controllers/waterController';

const router = Router();

// Log when this router is mounted and each incoming request for diagnosis
console.log('[waterRoutes] module loaded');

router.use((req, res, next) => {
	try {
		if (req.path === '/analyze-water') {
			console.log('[waterRoutes] incoming', req.method, req.path, 'ip=', req.ip, 'host=', req.hostname);
			console.log('[waterRoutes] headers=', JSON.stringify(req.headers || {}).slice(0, 1000));
			console.log('[waterRoutes] body=', JSON.stringify(req.body || {}).slice(0, 1000));
		}
	} catch (err) {
		// ignore logging errors
	}
	next();
});

router.post('/analyze-water', analyzeWater);

// Temporary debug endpoint - echoes request and confirms route works in production.
// Deploy this, test with POST /api/ai/analyze-water-debug and then remove it.
router.post('/analyze-water-debug', (req, res) => {
	try {
		console.log('[waterRoutes] /analyze-water-debug headers=', JSON.stringify(req.headers || {}).slice(0, 2000));
		console.log('[waterRoutes] /analyze-water-debug body=', JSON.stringify(req.body || {}).slice(0, 2000));
	} catch (e) {
		console.error('[waterRoutes] error logging debug request', e);
	}
	res.json({ ok: true, route: '/api/ai/analyze-water-debug', received: req.body });
});

export default router;
