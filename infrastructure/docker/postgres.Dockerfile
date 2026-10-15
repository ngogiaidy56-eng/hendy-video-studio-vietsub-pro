FROM postgres:16-alpine
COPY database/postgres-rbac/*.sql /docker-entrypoint-initdb.d/
