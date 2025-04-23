# Export current local schema to schema.sql
export-schema:
	pg_dump -U danielkallberg -h localhost -p 5433 --schema-only macspot > db/schema.sql

# Push schema.sql to Azure PostgreSQL
push-schema:
	psql "postgres://daniel%40macspotpg:0DsgJwXbVkJ6TnZ@macspotpg.postgres.database.azure.com/flexibleserverdb?sslmode=require" -f db/schema.sql