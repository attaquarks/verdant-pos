#!/bin/sh
# Build and run the fixture in a disposable copy. Never mutate the active app,
# its .next, or its installed dependencies.
set -eu
source_dir=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
fixture_dir=$(mktemp -d "${TMPDIR:-/tmp}/verdant-chart-fixture.XXXXXXXX")
echo "Isolated fixture retained at $fixture_dir"
(cd "$source_dir" && tar --exclude='./.git' --exclude='./.next' --exclude='./node_modules' --exclude='./artifacts' --exclude='./playwright-report' --exclude='./test-results' --exclude='./tsconfig.tsbuildinfo' --exclude='./.env*' --exclude='./backups' --exclude='./supabase/.temp' --exclude='./supabase/.branches' -cf - .) | (cd "$fixture_dir" && tar -xf -)
# Independent dependencies: builds and test runners cannot write into the source tree.
cp -a -- "$source_dir/node_modules" "$fixture_dir/node_modules"
mkdir -p "$fixture_dir/src/app/chart-fixture"
cp "$fixture_dir/tests/fixtures/chart-page.tsx" "$fixture_dir/src/app/chart-fixture/page.tsx"
cd "$fixture_dir"
CHART_FIXTURE_ENABLED=1 NEXT_TELEMETRY_DISABLED=1 npx playwright test tests/e2e/chart-responsive.spec.ts --workers=1
