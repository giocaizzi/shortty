.PHONY: help check install lint typecheck test knip precommit dev package make setup-hooks e2e e2e-benchmark smoke readme-screenshots

help: ## Show this help.
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make <target>\n\nTargets:\n"} /^[a-zA-Z0-9_-]+:.*##/ { printf "  %-12s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

check: lint test ## Run lint and tests.

install: ## Install dependencies (npm ci).
	npm ci

lint: ## Run eslint.
	npm run lint

typecheck: ## Run tsc --noEmit.
	npx tsc --noEmit

test: ## Run vitest.
	npm test

knip: ## Find unused code with knip.
	npx knip

precommit: lint typecheck test knip ## Run lint, typecheck, test, knip.

dev: ## Start the app in dev mode.
	npm start

package: ## Package the app.
	npm run package

MAKE_ARGS = $(strip $(if $(ARCH),--arch=$(ARCH)) $(if $(FROM_PACKAGE),--from-package))
make: ## Build distributables (ARCH=x64 cross-builds for Intel Macs; FROM_PACKAGE=1 reuses out/ from make package).
	npm run make $(if $(MAKE_ARGS),-- $(MAKE_ARGS))

# The launcher hides on blur, so concurrent runs (several worktrees) steal each
# other's focus: serialize them on a machine-wide lock (macOS lockf).
E2E_LOCK ?= /tmp/shortty-e2e.lock
E2E_RUN = $(if $(shell command -v lockf),lockf -t 3600 $(E2E_LOCK),)

smoke: ## Package, then launch the packaged app and wait for "App ready" (catches start-up crashes).
	npm run package
	node scripts/smoke-packaged.mjs

e2e: ## Build, then run the Playwright e2e suite on the real app (slow, not in check).
	$(E2E_RUN) sh -c 'npm run package && npx playwright test'

LABEL ?= baseline
e2e-benchmark: ## Build, then write timings and screenshots to docs/wip/benchmark (LABEL=baseline).
	$(E2E_RUN) sh -c 'npm run package && SHORTTY_E2E_BENCHMARK=$(LABEL) npx playwright test benchmark'

readme-screenshots: ## Build, then regenerate the README screenshots in docs/assets.
	$(E2E_RUN) sh -c 'npm run package && SHORTTY_E2E_README=1 npx playwright test tests/e2e/readme.spec.ts'

setup-hooks: ## Install the pre-commit hook.
	@echo "#!/bin/sh\nmake precommit" > .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "pre-commit hook installed"
