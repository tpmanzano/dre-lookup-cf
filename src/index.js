/**
 * DRE License Lookup — Cloudflare Worker
 * California Advantage Escrow — Compliance
 *
 * Proxies DRE license lookups (solves CORS) and serves the frontend.
 * Migrated from Flask/Render to Cloudflare Workers.
 *
 * Architecture: Option A — single Worker serves HTML + API proxy.
 * Future: migrate to Option B (Pages for static + Worker for API) when
 * building the shared mPower template architecture.
 */

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DRE License Lookup — California Advantage Escrow</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f5f6fa;
            color: #333;
            min-height: 100vh;
        }

        .header {
            background: #1a365d;
            color: white;
            padding: 20px 0;
            text-align: center;
        }

        .header h1 {
            font-size: 22px;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .header .subtitle {
            font-size: 13px;
            opacity: 0.8;
        }

        .container {
            max-width: 700px;
            margin: 30px auto;
            padding: 0 20px;
        }

        .search-card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            padding: 30px;
            margin-bottom: 20px;
        }

        .search-row {
            display: flex;
            gap: 12px;
            align-items: flex-end;
        }

        .search-row .field {
            flex: 1;
        }

        .search-row label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: #555;
            margin-bottom: 6px;
        }

        .search-row input {
            width: 100%;
            padding: 10px 14px;
            font-size: 16px;
            border: 1px solid #ddd;
            border-radius: 6px;
            outline: none;
            transition: border-color 0.2s;
        }

        .search-row input:focus {
            border-color: #1a365d;
        }

        .btn {
            padding: 10px 28px;
            font-size: 15px;
            font-weight: 600;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
        }

        .btn-primary {
            background: #1a365d;
            color: white;
        }

        .btn-primary:hover {
            background: #2a4a7f;
        }

        .btn-primary:disabled {
            background: #999;
            cursor: not-allowed;
        }

        .btn-print {
            background: #2d7d46;
            color: white;
            margin-left: 8px;
        }

        .btn-print:hover {
            background: #3a9d59;
        }

        .status {
            margin-top: 12px;
            font-size: 13px;
            color: #888;
        }

        .status.error {
            color: #c53030;
        }

        .result-card {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.08);
            padding: 24px;
            display: none;
        }

        .result-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid #eee;
        }

        .result-header h2 {
            font-size: 16px;
            color: #1a365d;
        }

        .result-content {
            font-family: Arial, Helvetica, sans-serif;
            font-size: 14px;
            line-height: 1.6;
        }

        .result-content table {
            width: 100%;
        }

        .result-content td {
            padding: 4px 8px;
            vertical-align: top;
        }

        .dre-link {
            text-align: center;
            margin-top: 20px;
            font-size: 12px;
        }

        .dre-link a {
            color: #1a365d;
        }

        @media print {
            body { background: white; margin: 0; }
            .header { display: none; }
            .search-card { display: none; }
            .dre-link { display: none; }
            .container { max-width: 100%; margin: 0; padding: 0; }
            .result-card {
                box-shadow: none;
                padding: 0;
                page-break-inside: avoid;
            }
            .result-header .btn { display: none; }
            .result-content {
                font-size: 11px;
                line-height: 1.3;
            }
            .result-content td {
                padding: 2px 6px;
            }
        }

        @media (max-width: 500px) {
            .search-row {
                flex-direction: column;
            }
            .btn {
                width: 100%;
            }
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>DRE License Lookup</h1>
        <div class="subtitle">California Advantage Escrow &mdash; Compliance</div>
    </div>

    <div class="container">
        <div class="search-card">
            <form id="lookupForm" onsubmit="doLookup(event)">
                <div class="search-row">
                    <div class="field">
                        <label for="licenseInput">DRE License Number</label>
                        <input type="text" id="licenseInput" placeholder="e.g. 01430466"
                               maxlength="8" autocomplete="off" autofocus>
                    </div>
                    <button type="submit" class="btn btn-primary" id="lookupBtn">Lookup</button>
                </div>
            </form>
            <div class="status" id="status"></div>
        </div>

        <div class="result-card" id="resultCard">
            <div class="result-header">
                <h2 id="resultTitle">License Information</h2>
                <div>
                    <button class="btn btn-print" onclick="printResult()">Save as PDF</button>
                </div>
            </div>
            <div class="result-content" id="resultContent"></div>
        </div>

        <div class="dre-link">
            <a href="https://www2.dre.ca.gov/publicasp/pplinfo.asp" target="_blank" rel="noopener">
                DRE Public License Lookup &rarr; www2.dre.ca.gov/publicasp/pplinfo.asp
            </a>
        </div>
    </div>

    <script>
        const form = document.getElementById('lookupForm');
        const input = document.getElementById('licenseInput');
        const btn = document.getElementById('lookupBtn');
        const status = document.getElementById('status');
        const resultCard = document.getElementById('resultCard');
        const resultTitle = document.getElementById('resultTitle');
        const resultContent = document.getElementById('resultContent');

        input.addEventListener('input', function() {
            this.value = this.value.replace(/\\D/g, '');
        });

        async function doLookup(e) {
            e.preventDefault();

            const licenseId = input.value.trim();
            if (!licenseId) {
                setStatus('Please enter a license number.', true);
                return;
            }

            btn.disabled = true;
            setStatus('Looking up license...');
            resultCard.style.display = 'none';

            try {
                const resp = await fetch('/api/lookup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ license_id: licenseId }),
                });

                const data = await resp.json();

                if (!resp.ok) {
                    setStatus(data.error || 'Lookup failed.', true);
                    return;
                }

                resultContent.innerHTML = data.html;
                resultTitle.textContent = data.name
                    ? data.name + ' — ' + data.license_id
                    : 'License ' + data.license_id;
                resultCard.style.display = 'block';
                setStatus('');

                const namePart = data.name
                    ? data.name.replace(/,\\s*/g, '_').replace(/\\s+/g, '_')
                    : '';
                const now = new Date();
                const timestamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '_');
                document.title = namePart
                    ? 'DRE_License_' + namePart + '_' + data.license_id + '_' + timestamp
                    : 'DRE_License_' + data.license_id + '_' + timestamp;

                resultCard.scrollIntoView({ behavior: 'smooth', block: 'start' });

            } catch (err) {
                setStatus('Connection error. Check your internet and try again.', true);
            } finally {
                btn.disabled = false;
            }
        }

        function setStatus(msg, isError) {
            status.textContent = msg;
            status.className = isError ? 'status error' : 'status';
        }

        function printResult() {
            window.print();
        }
    </script>
</body>
</html>`;

const DRE_SEARCH_URL = 'https://www2.dre.ca.gov/publicasp/pplinfo.asp?start=1';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Serve the HTML page
    if (url.pathname === '/' || url.pathname === '') {
      return new Response(HTML_PAGE, {
        headers: { 'Content-Type': 'text/html;charset=UTF-8' },
      });
    }

    // API proxy to DRE
    if (url.pathname === '/api/lookup' && request.method === 'POST') {
      return handleLookup(request);
    }

    return new Response('Not found', { status: 404 });
  },
};

async function handleLookup(request) {
  try {
    const body = await request.json();
    const licenseId = (body.license_id || '').trim();

    // Validate: digits only, max 8 chars
    if (!licenseId || !/^\d{1,8}$/.test(licenseId)) {
      return jsonResponse({ error: 'Invalid license number. Digits only, max 8 characters.' }, 400);
    }

    // POST to DRE
    const formData = new URLSearchParams();
    formData.append('h_nextstep', 'SEARCH');
    formData.append('LICENSEE_NAME', '');
    formData.append('CITY_STATE', '');
    formData.append('LICENSE_ID', licenseId);

    const dreResp = await fetch(DRE_SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!dreResp.ok) {
      return jsonResponse({ error: `DRE site returned status ${dreResp.status}` }, 502);
    }

    const html = await dreResp.text();

    // Check for no results
    if (html.includes('No records found') || !html.includes('License Type:')) {
      return jsonResponse({ error: `No records found for license ID: ${licenseId}` }, 404);
    }

    // Extract result section
    const resultHtml = extractResult(html);
    const name = extractName(html);

    return jsonResponse({ html: resultHtml, name, license_id: licenseId });

  } catch (err) {
    if (err.message && err.message.includes('timed out')) {
      return jsonResponse({ error: 'DRE site timed out. Try again.' }, 504);
    }
    return jsonResponse({ error: `Could not reach DRE site: ${err.message}` }, 502);
  }
}

function extractResult(html) {
  // Extract the license result from DRE response HTML
  const match = html.match(
    /License information taken[\s\S]*?Public information request complete\s*(?:<<<<|&lt;&lt;&lt;&lt;)/
  );

  let content;
  if (match) {
    content = match[0];
  } else {
    // Fallback: extract from the main table
    const tableMatch = html.match(/(<table[^>]*>[\s\S]*?<\/table>)\s*<\/body>/);
    content = tableMatch ? tableMatch[1] : html;
  }

  // Rewrite relative URLs to absolute
  content = content.replace(/HREF\s*=\s*"\/static\//gi, 'HREF = "https://www2.dre.ca.gov/static/');
  content = content.replace(/HREF\s*=\s*"\/publicasp\//gi, 'HREF = "https://www2.dre.ca.gov/publicasp/');
  content = content.replace(/href\s*=\s*'\/static\//gi, "href='https://www2.dre.ca.gov/static/");
  content = content.replace(/href\s*=\s*'\/publicasp\//gi, "href='https://www2.dre.ca.gov/publicasp/");

  return content;
}

function extractName(html) {
  const match = html.match(/<strong>Name:<\/strong>[\s\S]*?<\/td>\s*<td>[\s\S]*?>([\w,\s]+)</);
  return match ? match[1].trim() : '';
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
