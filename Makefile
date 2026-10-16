# Load .env (API key, settings) into every command.
-include .env
export

export DAGSTER_HOME := $(CURDIR)/.dagster_home

.PHONY: setup up schema produce decide report ui test down smoke

setup:            ## install Python deps
	python -m pip install -r requirements.txt
	mkdir -p $(DAGSTER_HOME)

up:               ## start Redpanda (Kafka) + ClickHouse
	docker compose up -d
	@echo "Waiting for ClickHouse..."; until curl -s localhost:8123/ping >/dev/null; do sleep 1; done; echo ok

schema:           ## create tables, Kafka engine table and materialized view
	python -c "from jevpipe import store; store.init_schema()"

produce:          ## stream all 3,080 tickets into Kafka
	python -m jevpipe.producer

smoke:            ## 25 real Jev calls, to confirm the key and the setup work
	dagster asset materialize -m jevpipe.definitions --select 'clickhouse_schema,ground_truth,jev_decisions' \
	  --config-json '{"ops": {"jev_decisions": {"config": {"limit": 25}}}}'

decide:           ## decide every pending ticket and build the report
	dagster asset materialize -m jevpipe.definitions --select '*'

ui:               ## Dagster UI on http://localhost:3000
	dagster dev -m jevpipe.definitions

test:
	pytest -q

down:
	docker compose down
