# build.ps1
# Script to compile template files into a single deployable public/index.html file.

$index = Get-Content -Raw -Encoding utf8 "Index v2.txt"
$stylesheet = Get-Content -Raw -Encoding utf8 "Stylesheet v1.txt"
$logos = Get-Content -Raw -Encoding utf8 "Logo.txt"
$jsClient = Get-Content -Raw -Encoding utf8 "JavaScriptClient v2.txt"

# Polyfill to map google.script.run to fetch(/api/rpc)
$polyfill = @"
if (typeof google === 'undefined' || !google.script || !google.script.run) {
  var google = {
    script: {
      run: (function() {
        const createBuilder = (successHandler = null, failureHandler = null) => {
          return new Proxy({}, {
            get(builderTarget, builderProp) {
              if (builderProp === 'withSuccessHandler') {
                return function(fn) {
                  return createBuilder(fn, failureHandler);
                };
              }
              if (builderProp === 'withFailureHandler') {
                return function(fn) {
                  return createBuilder(successHandler, fn);
                };
              }
              return async function(...args) {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 30000);
                try {
                  const response = await fetch('/api/rpc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ method: builderProp, params: args }),
                    signal: ctrl.signal
                  });
                  clearTimeout(timer);
                  const data = await response.json();
                  console.log('[RPC]', builderProp, '->', data);
                  // Server selalu mengembalikan HTTP 200; bedakan sukses dari field `success`
                  if (response.ok && data && data.success !== false) {
                    if (successHandler) successHandler(data);
                  } else {
                    const msg = (data && (data.message || data.error)) || 'Server error';
                    if (failureHandler) failureHandler({ message: msg });
                    else console.error('[RPC] failure (no handler):', msg);
                  }
                } catch (err) {
                  clearTimeout(timer);
                  const msg = err.name === 'AbortError' ? 'Request timeout (30s)' : (err.message || String(err));
                  console.error('[RPC] catch:', builderProp, msg);
                  if (failureHandler) failureHandler({ message: msg });
                }
              };
            }
          });
        };

        return new Proxy({}, {
          get(target, prop) {
            if (prop === 'withSuccessHandler') {
              return function(fn) {
                return createBuilder(fn, null);
              };
            }
            if (prop === 'withFailureHandler') {
              return function(fn) {
                return createBuilder(null, fn);
              };
            }

            return async function(...args) {
              try {
                const response = await fetch('/api/rpc', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ method: prop, params: args })
                });
                const data = await response.json();
                // Direct calls do not have callbacks
              } catch (err) {
                console.error('RPC Error:', err);
              }
            };
          }
        });
      })()
    }
  };
}
"@

$jsClientWithPolyfill = $jsClient -replace "<script>", "<script>`n$polyfill"

# Perform replacements
$output = $index -replace '<\?!= include\(''Stylesheet''\); \?>', $stylesheet
$output = $output -replace '<\?!= include\(''Logos''\); \?>', $logos
$output = $output -replace '<\?!= include\(''JavaScriptClient''\); \?>', $jsClientWithPolyfill

if (-not (Test-Path "public")) {
    New-Item -ItemType Directory -Path "public"
}

[System.IO.File]::WriteAllText("public/index.html", $output, [System.Text.Encoding]::UTF8)
Write-Output "Successfully built public/index.html!"
