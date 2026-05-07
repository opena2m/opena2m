.PHONY: help dev-up dev-down seed gateway-dev console-dev test lint clean

GATEWAY_URL ?= http://localhost:8080
DEV_TOKEN   ?= dev-token

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

## ─── Docker Compose ──────────────────────────────────────────────────────────

dev-up: ## Start full stack with Docker Compose
	docker compose -f deploy/docker-compose.yml up --build -d
	@echo ""
	@echo "  Gateway:  http://localhost:8080"
	@echo "  Console:  http://localhost:3000"
	@echo "  MinIO UI: http://localhost:9001"
	@echo ""
	@echo "Waiting for gateway…"
	@until curl -sf http://localhost:8080/health > /dev/null; do sleep 1; done
	@echo "Gateway ready. Run: make seed"

dev-down: ## Stop and remove containers
	docker compose -f deploy/docker-compose.yml down

dev-logs: ## Follow logs from all services
	docker compose -f deploy/docker-compose.yml logs -f

dev-ps: ## Show service status
	docker compose -f deploy/docker-compose.yml ps

## ─── Seed ────────────────────────────────────────────────────────────────────

seed: ## Register reference devices, budgets, and policies
	AIMP_GATEWAY_URL=$(GATEWAY_URL) AIMP_DEV_TOKEN=$(DEV_TOKEN) \
		python scripts/seed.py

## ─── Local development (no Docker) ──────────────────────────────────────────

gateway-dev: ## Run gateway in dev mode (requires local postgres+redis or uses SQLite)
	cd gateway && \
		AIMP_DEV=true AIMP_DEV_TOKEN=dev-token \
		AIMP_DB_URL=sqlite+aiosqlite:///./opena2m.db \
		AIMP_REDIS_URL=redis://localhost:6379/0 \
		uvicorn app.main:app --reload --port 8080

gateway-install: ## Install gateway Python deps
	cd gateway && pip install -r requirements.txt

console-dev: ## Run console dev server
	cd console && npm run dev

console-install: ## Install console npm deps
	cd console && npm install

## ─── Testing ─────────────────────────────────────────────────────────────────

test: test-gateway test-e2e ## Run all tests

test-gateway: ## Run gateway unit tests
	cd gateway && python -m pytest tests/ -v --tb=short

test-e2e: ## Run end-to-end scenario tests
	@echo "Running scenario: Cloud 2D Print (Journey A)"
	python scripts/test_journey_a.py
	@echo "Running scenario: FDM with HITL (Journey B)"
	python scripts/test_journey_b.py

test-e2e-console: ## Run Playwright E2E tests for the console
	cd console && npx playwright test

test-journey-c: ## Journey C — developer adds a third-party adapter
	python scripts/test_journey_c.py

test-journey-d: ## Journey D — budget runaway enforcement
	python scripts/test_journey_d.py

## ─── Lint ────────────────────────────────────────────────────────────────────

lint: lint-gateway lint-console ## Lint everything

lint-gateway: ## Lint gateway Python
	cd gateway && python -m ruff check app/ && python -m mypy app/ --ignore-missing-imports

lint-console: ## Lint console TypeScript
	cd console && npm run lint

## ─── Audit ───────────────────────────────────────────────────────────────────

audit-verify: ## Verify the audit log hash chain (ed25519 + hash-chain)
	cd gateway && python -m app.cli.audit_verify --gateway $(GATEWAY_URL) --token $(DEV_TOKEN) --verbose

## ─── Utility ─────────────────────────────────────────────────────────────────

discover: ## Run discover against the gateway
	curl -sf -X POST "$(GATEWAY_URL)/v1/discover" \
		-H "Authorization: Bearer $(DEV_TOKEN)" \
		-H "Content-Type: application/json" \
		-d '{"envelope":{"aimp_version":"1.0","job_id":"cli-discover-01"}}' \
		| python -m json.tool

health: ## Check gateway health
	curl -sf "$(GATEWAY_URL)/health" | python -m json.tool

capabilities: ## Check gateway capabilities
	curl -sf "$(GATEWAY_URL)/capabilities" | python -m json.tool

clean: ## Remove generated files
	find . -name "*.pyc" -delete
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	cd console && rm -rf node_modules dist 2>/dev/null || true
	rm -f gateway/opena2m.db 2>/dev/null || true
