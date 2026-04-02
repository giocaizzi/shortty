.PHONY: install lint typecheck test knip precommit dev package make setup-hooks

install:
	npm ci

lint:
	npm run lint

typecheck:
	npx tsc --noEmit

test:
	npm test

knip:
	npx knip

precommit: lint typecheck test knip

dev:
	npm start

package:
	npm run package

make:
	npm run make

setup-hooks:
	@echo "#!/bin/sh\nmake precommit" > .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "pre-commit hook installed"
