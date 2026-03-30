.PHONY: dev build lint test typecheck verify setup

setup:
	pnpm install

dev:
	pnpm turbo dev

build:
	pnpm turbo build

lint:
	pnpm turbo lint

test:
	pnpm turbo test

typecheck:
	pnpm turbo typecheck

verify:
	pnpm verify

db\:generate:
	pnpm turbo db:generate

db\:push:
	pnpm turbo db:push
