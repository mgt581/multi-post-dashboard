// worker.js

function handleRequest(pathname) {
    let response;
    let matched = false;

    // Define your API routes here
    const routes = {
        "/api/health": () => {
            response = new Response(JSON.stringify({ ok: true, version: '2026-03-21' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            });
            matched = true;
        },
        // Add other routes as necessary
    };

    // Match and call the corresponding route handler
    if (routes[pathname]) {
        routes[pathname]();
    }

    return { response, matched };
}

addEventListener('fetch', event => {
    const { request } = event;
    const { pathname } = new URL(request.url);

    if (pathname.startsWith('/api/')) {
        const { response, matched } = handleRequest(pathname);

        if (!matched) {
            // Return 404 response with CORS headers
            response = new Response(JSON.stringify({ error: 'Not Found' }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                }
            });
        }
        // Respond with either matched route response or 404
        event.respondWith(response);
    } else {
        // Keep redirect behavior for other paths
        // Your existing redirect logic here...
    }
});

// Keep existing functionality here...