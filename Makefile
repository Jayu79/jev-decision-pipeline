# Load .env (API key, settings) into every command.
-include .env
export

export AIRFLOW_HOME := $(CURDIR)/.airflow
export AIRFLOW__CORE__DAGS_FOLDER := $(CURDIR)/dags
export AIRFLOW__CORE__LOAD_EXAMPLES := False

DAG := jev_decision_pipeline

.PHONY: setup up schema produce smoke decide ui test down

setup:            ## install deps (use a virtualenv) and initialise Airflow's metadata DB
	python -m pip install -r requirements.txt
	airflow db migrate

up:               ## start Redpanda (Kafka) + ClickHouse
	docker compose up -d
	@echo "Waiting for ClickHouse..."; until curl -s localhost:8123/ping >/dev/null; do sleep 1; done; echo ok

schema:           ## create tables, Kafka engine table and materialized view
	python -c "from jevpipe import store; store.init_schema()"

produce:          ## stream all 3,080 tickets into Kafka
	python -m jevpipe.producer

smoke:            ## 25 real Jev calls, to confirm the key and the setup work
	airflow dags test $(DAG) -c '{"limit": 25}'

decide:           ## decide every pending ticket, run the checks, build the report
	airflow dags test $(DAG)

ui:               ## Airflow UI on http://localhost:8080 (login printed in the terminal)
	airflow standalone

test:
	pytest -q

down:
	docker compose down
