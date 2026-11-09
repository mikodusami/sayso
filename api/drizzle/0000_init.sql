CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"runs_guard" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "checkouts" (
	"id" text PRIMARY KEY NOT NULL,
	"mandate_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"agent_provider_id" text NOT NULL,
	"shopper_id" text NOT NULL,
	"product_title" text NOT NULL,
	"quote" jsonb NOT NULL,
	"checks" jsonb NOT NULL,
	"ai_judged_fields" jsonb NOT NULL,
	"flagged" boolean NOT NULL,
	"override" jsonb,
	"status" text NOT NULL,
	"paypal_order_id" text,
	"capture_id" text,
	"payer_id" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" text PRIMARY KEY NOT NULL,
	"checkout_id" text NOT NULL,
	"source" text NOT NULL,
	"text" text NOT NULL,
	"paypal_dispute_id" text,
	"classification" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_ids" text[] NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"message" text NOT NULL,
	"paypal_ref" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "findings" (
	"id" text PRIMARY KEY NOT NULL,
	"complaint_id" text NOT NULL,
	"checkout_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"agent_provider_id" text NOT NULL,
	"decision" jsonb NOT NULL,
	"facts" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"amount" text NOT NULL,
	"status" text NOT NULL,
	"refund_id" text,
	"payout_batch_id" text,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"tenant_id" text NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" integer NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_tenant_id_key_pk" PRIMARY KEY("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "mandates" (
	"id" text PRIMARY KEY NOT NULL,
	"shopper_id" text NOT NULL,
	"agent_provider_id" text NOT NULL,
	"body" jsonb NOT NULL,
	"canonical" text NOT NULL,
	"fingerprint" text NOT NULL,
	"status" text NOT NULL,
	"approval" jsonb,
	"uses_left" integer NOT NULL,
	"budget_spent" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mandates_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "paypal_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"sku" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"attributes" jsonb NOT NULL,
	"price" text NOT NULL,
	"shipping" text NOT NULL,
	"tax" text NOT NULL,
	"stock" integer NOT NULL,
	"ships_in_days" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"checkout_id" text NOT NULL,
	"carrier" text NOT NULL,
	"tracking_number" text NOT NULL,
	"shipped_sku" text NOT NULL,
	"paypal_tracker_id" text,
	"status" text NOT NULL,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoppers" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_provider_id" text NOT NULL,
	"external_ref" text NOT NULL,
	"display_name" text NOT NULL,
	"paypal_payer_id" text
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"paypal" jsonb,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "products_merchant_sku" ON "products" USING btree ("merchant_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "shoppers_provider_ref" ON "shoppers" USING btree ("agent_provider_id","external_ref");