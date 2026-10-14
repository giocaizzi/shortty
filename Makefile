.PHONY: help check install lint typecheck test knip precommit dev package make setup-hooks e2e e2e-benchmark

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

make: ## Build distributables.
	npm run make

e2e: ## Build, then run the Playwright e2e suite on the real app (slow, not in check).
	npm run package
	npx playwright test

LABEL ?= baseline
e2e-benchmark: ## Build, then write timings and screenshots to docs/wip/benchmark (LABEL=baseline).
	npm run package
	SHORTTY_E2E_BENCHMARK=$(LABEL) npx playwright test benchmark

setup-hooks: ## Install the pre-commit hook.
	@echo "#!/bin/sh\nmake precommit" > .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "pre-commit hook installed"
