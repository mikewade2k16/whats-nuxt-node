alter table if exists operation_queue_entries
	alter column queue_joined_at type timestamptz
	using to_timestamp(queue_joined_at::double precision / 1000.0);

alter table if exists operation_active_services
	alter column service_started_at type timestamptz
	using to_timestamp(service_started_at::double precision / 1000.0),
	alter column queue_joined_at type timestamptz
	using to_timestamp(queue_joined_at::double precision / 1000.0);

alter table if exists operation_paused_consultants
	alter column started_at type timestamptz
	using to_timestamp(started_at::double precision / 1000.0);

alter table if exists operation_current_status
	alter column started_at type timestamptz
	using to_timestamp(started_at::double precision / 1000.0);

alter table if exists operation_status_sessions
	alter column started_at type timestamptz
	using to_timestamp(started_at::double precision / 1000.0),
	alter column ended_at type timestamptz
	using to_timestamp(ended_at::double precision / 1000.0);

alter table if exists operation_service_history
	alter column started_at type timestamptz
	using to_timestamp(started_at::double precision / 1000.0),
	alter column finished_at type timestamptz
	using to_timestamp(finished_at::double precision / 1000.0);
