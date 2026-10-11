.PHONY: help check install lint typecheck test knip precommit dev package make setup-hooks

help: ## Show this help.
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make <target>\n\nTargets:\n"} /^[a-zA-Z_-]+:.*##/ { printf "  %-12s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

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

setup-hooks: ## Install the pre-commit hook.
	@echo "#!/bin/sh\nmake precommit" > .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "pre-commit hook installed"
