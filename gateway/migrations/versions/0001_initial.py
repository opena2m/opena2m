"""Alembic initial migration — creates all OpenA2M tables."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers
revision = '0001_initial'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # principals
    op.create_table(
        'principals',
        sa.Column('principal_id', sa.String(26), primary_key=True),
        sa.Column('kind', sa.String(16), nullable=False),
        sa.Column('display_name', sa.Text, nullable=False),
        sa.Column('external_id', sa.String(256), unique=True, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('disabled_at', sa.DateTime(timezone=True), nullable=True),
    )

    # api_tokens
    op.create_table(
        'api_tokens',
        sa.Column('token_id', sa.String(26), primary_key=True),
        sa.Column('principal_id', sa.String(26),
                  sa.ForeignKey('principals.principal_id'), nullable=False),
        sa.Column('token_hash', sa.String(64), nullable=False),
        sa.Column('scope_json', sa.JSON, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    )

    # domains
    op.create_table(
        'domains',
        sa.Column('domain_id', sa.String(256), primary_key=True),
        sa.Column('schema_uri', sa.Text, nullable=False),
        sa.Column('schema_json', sa.JSON, nullable=False),
        sa.Column('adapter_package', sa.Text, nullable=False),
        sa.Column('adapter_version', sa.String(32), nullable=False),
        sa.Column('registered_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )

    # devices
    op.create_table(
        'devices',
        sa.Column('device_id', sa.String(128), primary_key=True),
        sa.Column('display_name', sa.Text, nullable=True),
        sa.Column('vendor', sa.String(128), nullable=True),
        sa.Column('model', sa.String(128), nullable=True),
        sa.Column('firmware', sa.String(64), nullable=True),
        sa.Column('location_json', sa.JSON, nullable=True),
        sa.Column('risk_tier', sa.String(16), nullable=True),
        sa.Column('conformance', sa.String(4), nullable=True),
        sa.Column('status_json', sa.JSON, nullable=False),
        sa.Column('capabilities_json', sa.JSON, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('disabled_at', sa.DateTime(timezone=True), nullable=True),
    )

    # device_domains (no FK on domain_id — domain row created async at startup)
    op.create_table(
        'device_domains',
        sa.Column('device_id', sa.String(128),
                  sa.ForeignKey('devices.device_id'), primary_key=True),
        sa.Column('domain_id', sa.String(256), primary_key=True),  # no FK — async seeded
    )

    # policies
    op.create_table(
        'policies',
        sa.Column('policy_id', sa.String(26), primary_key=True),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('priority', sa.Integer, nullable=False, server_default='100'),
        sa.Column('enabled', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('rule_json', sa.JSON, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )

    # budgets
    op.create_table(
        'budgets',
        sa.Column('budget_id', sa.String(26), primary_key=True),
        sa.Column('name', sa.String(256), nullable=False),
        sa.Column('principal_id', sa.String(26),
                  sa.ForeignKey('principals.principal_id'), nullable=True),
        sa.Column('currency', sa.String(3), nullable=False, server_default='USD'),
        sa.Column('ceiling', sa.Float, nullable=False),
        sa.Column('consumed', sa.Float, nullable=False, server_default='0'),
        sa.Column('warn_threshold', sa.Float, nullable=False, server_default='0.8'),
        sa.Column('period', sa.String(16), nullable=True),
        sa.Column('period_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )

    # jobs
    op.create_table(
        'jobs',
        sa.Column('job_id', sa.String(26), primary_key=True),
        sa.Column('device_id', sa.String(128),
                  sa.ForeignKey('devices.device_id'), nullable=True),
        sa.Column('domain_id', sa.String(256), nullable=True),
        sa.Column('principal_id', sa.String(26),
                  sa.ForeignKey('principals.principal_id'), nullable=True),
        sa.Column('state', sa.String(16), nullable=False, server_default='PENDING'),
        sa.Column('progress', sa.Float, nullable=False, server_default='0'),
        sa.Column('request_json', sa.JSON, nullable=True),
        sa.Column('asset_json', sa.JSON, nullable=True),
        sa.Column('payload_json', sa.JSON, nullable=True),
        sa.Column('logistics_json', sa.JSON, nullable=True),
        sa.Column('metadata_json', sa.JSON, nullable=True),
        sa.Column('idempotency_key', sa.String(256), unique=True, nullable=True),
        sa.Column('error_code', sa.String(64), nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_jobs_state', 'jobs', ['state'])
    op.create_index('ix_jobs_device_id', 'jobs', ['device_id'])
    op.create_index('ix_jobs_created_at', 'jobs', ['created_at'])

    # quotes
    op.create_table(
        'quotes',
        sa.Column('quote_id', sa.String(26), primary_key=True),
        sa.Column('job_id', sa.String(26), sa.ForeignKey('jobs.job_id'), nullable=False),
        sa.Column('device_id', sa.String(128), nullable=False),
        sa.Column('domain_id', sa.String(256), nullable=False),
        sa.Column('estimated_cost_json', sa.JSON, nullable=False),
        sa.Column('resource_consumption_json', sa.JSON, nullable=True),
        sa.Column('budget_reserve_json', sa.JSON, nullable=True),
        sa.Column('valid_until', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )

    # job_state_transitions
    op.create_table(
        'job_state_transitions',
        sa.Column('id', sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column('job_id', sa.String(26), sa.ForeignKey('jobs.job_id'), nullable=False),
        sa.Column('from_state', sa.String(16), nullable=True),
        sa.Column('to_state', sa.String(16), nullable=False),
        sa.Column('principal_id', sa.String(26), nullable=True),
        sa.Column('reason', sa.Text, nullable=True),
        sa.Column('entry_hash', sa.String(64), nullable=True),
        sa.Column('signature', sa.Text, nullable=True),
        sa.Column('at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_index('ix_transitions_job_id', 'job_state_transitions', ['job_id'])

    # telemetry_events
    op.create_table(
        'telemetry_events',
        sa.Column('id', sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column('job_id', sa.String(26), sa.ForeignKey('jobs.job_id'), nullable=False),
        sa.Column('channel', sa.String(128), nullable=False),
        sa.Column('kind', sa.String(32), nullable=False),
        sa.Column('value_json', sa.JSON, nullable=True),
        sa.Column('media_url', sa.Text, nullable=True),
        sa.Column('media_expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_index('ix_telemetry_job_id', 'telemetry_events', ['job_id'])
    op.create_index('ix_telemetry_at', 'telemetry_events', ['at'])

    # audit_entries
    op.create_table(
        'audit_entries',
        sa.Column('id', sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column('job_id', sa.String(26), sa.ForeignKey('jobs.job_id'), nullable=True),
        sa.Column('event_type', sa.String(64), nullable=False),
        sa.Column('principal_id', sa.String(26), nullable=True),
        sa.Column('payload_json', sa.JSON, nullable=True),
        sa.Column('entry_hash', sa.String(64), nullable=True),
        sa.Column('signature', sa.Text, nullable=True),
        sa.Column('at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )
    op.create_index('ix_audit_job_id', 'audit_entries', ['job_id'])
    op.create_index('ix_audit_event_type', 'audit_entries', ['event_type'])

    # webhook_endpoints
    op.create_table(
        'webhook_endpoints',
        sa.Column('endpoint_id', sa.String(26), primary_key=True),
        sa.Column('principal_id', sa.String(26),
                  sa.ForeignKey('principals.principal_id'), nullable=True),
        sa.Column('url', sa.Text, nullable=False),
        sa.Column('hmac_secret', sa.String(64), nullable=False),
        sa.Column('events', sa.JSON, nullable=False),
        sa.Column('enabled', sa.Boolean, nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )

    # webhook_deliveries
    op.create_table(
        'webhook_deliveries',
        sa.Column('id', sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column('endpoint_id', sa.String(26),
                  sa.ForeignKey('webhook_endpoints.endpoint_id'), nullable=False),
        sa.Column('job_id', sa.String(26), nullable=True),
        sa.Column('event_type', sa.String(64), nullable=False),
        sa.Column('payload_json', sa.JSON, nullable=False),
        sa.Column('status', sa.String(16), nullable=False, server_default='pending'),
        sa.Column('attempt', sa.Integer, nullable=False, server_default='0'),
        sa.Column('next_retry_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('response_code', sa.Integer, nullable=True),
        sa.Column('error_message', sa.Text, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_deliveries_status', 'webhook_deliveries', ['status'])
    op.create_index('ix_deliveries_next_retry', 'webhook_deliveries', ['next_retry_at'])


def downgrade() -> None:
    for table in [
        'webhook_deliveries', 'webhook_endpoints', 'audit_entries',
        'telemetry_events', 'job_state_transitions', 'quotes', 'jobs',
        'budgets', 'policies', 'device_domains', 'devices', 'domains',
        'api_tokens', 'principals',
    ]:
        op.drop_table(table)
