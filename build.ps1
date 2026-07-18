# build.ps1
# Script to compile template files into a single deployable public/index.html file.

$index = Get-Content -Raw -Encoding utf8 "Index v2.txt"
$stylesheet = Get-Content -Raw -Encoding utf8 "Stylesheet v1.txt"
$logos = Get-Content -Raw -Encoding utf8 "Logo.txt"
$jsClient = Get-Content -Raw -Encoding utf8 "JavaScriptClient v2.txt"

# Polyfill to map google.script.run to fetch(/api/rpc)
$polyfill = @"
const google = {
  script: {
    run: new Proxy({}, {
      get(target, prop) {
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
                try {
                  const response = await fetch('/api/rpc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ method: builderProp, params: args })
                  });
                  const data = await response.json();
                  if (response.ok) {
                    if (successHandler) successHandler(data);
                  } else {
                    if (failureHandler) failureHandler(data.message || 'Server error');
                  }
                } catch (err) {
                  if (failureHandler) failureHandler(err.message || err);
                }
              };
            }
          });
        };

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
    })
  }
};
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
