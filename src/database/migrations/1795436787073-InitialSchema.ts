import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1795436787073 implements MigrationInterface {
  name = 'InitialSchema1795436787073';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."users_roles_enum" AS ENUM('passenger', 'driver', 'admin')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'pending', 'suspended')`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying(255) NOT NULL, "phone" character varying(32) NOT NULL, "name" character varying(120) NOT NULL, "password_hash" character varying(255) NOT NULL, "roles" "public"."users_roles_enum" array NOT NULL DEFAULT '{passenger}', "status" "public"."users_status_enum" NOT NULL DEFAULT 'active', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_users_email" ON "users"  ("email") `);
    await queryRunner.query(
      `CREATE TYPE "public"."driver_profiles_online_status_enum" AS ENUM('offline', 'online', 'on_trip')`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_profiles" ("user_id" uuid NOT NULL, "licence_number" character varying(64), "operating_zone" character varying(64), "online_status" "public"."driver_profiles_online_status_enum" NOT NULL DEFAULT 'offline', "rating_avg" numeric(3,2) NOT NULL DEFAULT '0', "rides_count" integer NOT NULL DEFAULT '0', CONSTRAINT "CHK_driver_rating" CHECK ("rating_avg" >= 0 AND "rating_avg" <= 5), CONSTRAINT "PK_cec43742cd6dea0e8fcae3e29d8" PRIMARY KEY ("user_id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."vehicles_category_enum" AS ENUM('four_seater', 'six_seater', 'eight_seater', 'wheelchair')`,
    );
    await queryRunner.query(
      `CREATE TABLE "vehicles" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driver_id" uuid NOT NULL, "make_model" character varying(120) NOT NULL, "plate" character varying(16) NOT NULL, "category" "public"."vehicles_category_enum" NOT NULL DEFAULT 'four_seater', "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_18d8646b59304dce4af3a9e35b6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_vehicles_driver" ON "vehicles"  ("driver_id") `);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_vehicles_plate" ON "vehicles"  ("plate") `);
    await queryRunner.query(
      `CREATE TYPE "public"."driver_documents_type_enum" AS ENUM('licence', 'council_licence', 'council_plate', 'insurance', 'v5c')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."driver_documents_status_enum" AS ENUM('missing', 'pending', 'verified', 'expired')`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driver_id" uuid NOT NULL, "type" "public"."driver_documents_type_enum" NOT NULL, "status" "public"."driver_documents_status_enum" NOT NULL DEFAULT 'missing', "file_key" character varying(512), "expires_at" TIMESTAMP WITH TIME ZONE, "reviewed_by" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_driver_documents_driver_type" UNIQUE ("driver_id", "type"), CONSTRAINT "PK_31c28b4e8f55a5d411597d45ab2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "driver_locations" ("driver_id" uuid NOT NULL, "lat" double precision NOT NULL, "lng" double precision NOT NULL, "heading" smallint, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_096de534e1c6301cf7f2a4bf032" PRIMARY KEY ("driver_id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "blocks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "driver_id" uuid NOT NULL, "passenger_id" uuid NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_blocks_driver_passenger" UNIQUE ("driver_id", "passenger_id"), CONSTRAINT "PK_8244fa1495c4e9222a01059244b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."alerts_type_enum" AS ENUM('ride', 'scheduled', 'promo', 'document', 'system', 'sos')`,
    );
    await queryRunner.query(
      `CREATE TABLE "alerts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "type" "public"."alerts_type_enum" NOT NULL DEFAULT 'system', "title" character varying(120) NOT NULL, "body" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "read_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_60f895662df096bfcdfab7f4b96" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_alerts_user_created" ON "alerts"  ("user_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rides_status_enum" AS ENUM('requested', 'assigned', 'arrived', 'in_progress', 'completed', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rides_ride_type_enum" AS ENUM('standard', 'emergency', 'roadside')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rides_booking_mode_enum" AS ENUM('now', 'later')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rides_vehicle_category_enum" AS ENUM('four_seater', 'six_seater', 'eight_seater', 'wheelchair')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."rides_priority_enum" AS ENUM('normal', 'high', 'sos')`,
    );
    await queryRunner.query(
      `CREATE TABLE "rides" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "passenger_id" uuid NOT NULL, "driver_id" uuid, "status" "public"."rides_status_enum" NOT NULL DEFAULT 'requested', "ride_type" "public"."rides_ride_type_enum" NOT NULL DEFAULT 'standard', "booking_mode" "public"."rides_booking_mode_enum" NOT NULL DEFAULT 'now', "vehicle_category" "public"."rides_vehicle_category_enum" NOT NULL DEFAULT 'four_seater', "priority" "public"."rides_priority_enum" NOT NULL DEFAULT 'normal', "pickup_address" character varying(255) NOT NULL, "pickup_lat" double precision, "pickup_lng" double precision, "drop_address" character varying(255) NOT NULL, "drop_lat" double precision, "drop_lng" double precision, "scheduled_at" TIMESTAMP WITH TIME ZONE, "fare_estimate_pence" integer NOT NULL, "fare_final_pence" integer, "distance_m" integer, "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "assigned_at" TIMESTAMP WITH TIME ZONE, "arrived_at" TIMESTAMP WITH TIME ZONE, "started_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "cancelled_at" TIMESTAMP WITH TIME ZONE, "cancel_reason" character varying(255), CONSTRAINT "CHK_rides_fare_estimate" CHECK ("fare_estimate_pence" >= 0), CONSTRAINT "PK_ca6f62fc1e999b139c7f28f07fd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rides_driver_status" ON "rides"  ("driver_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_rides_status_requested" ON "rides"  ("status", "requested_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "ride_stops" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ride_id" uuid NOT NULL, "position" smallint NOT NULL, "address" character varying(255) NOT NULL, "lat" double precision, "lng" double precision, CONSTRAINT "UQ_ride_stops_ride_position" UNIQUE ("ride_id", "position"), CONSTRAINT "PK_2e8c457ff8246319c1af2ece467" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."ride_offers_response_enum" AS ENUM('pending', 'accepted', 'rejected', 'expired')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ride_offers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ride_id" uuid NOT NULL, "driver_id" uuid NOT NULL, "sent_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "response" "public"."ride_offers_response_enum" NOT NULL DEFAULT 'pending', "responded_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_8bd0ac2b8b108f575ceea9cb433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_ride_offers_ride" ON "ride_offers"  ("ride_id") `);
    await queryRunner.query(
      `CREATE TYPE "public"."ride_ratings_rated_by_role_enum" AS ENUM('passenger', 'driver')`,
    );
    await queryRunner.query(
      `CREATE TABLE "ride_ratings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ride_id" uuid NOT NULL, "rated_by_user_id" uuid NOT NULL, "rated_by_role" "public"."ride_ratings_rated_by_role_enum" NOT NULL, "score" smallint NOT NULL, "comment" character varying(500), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_a5afb75359a6be2111de190969" UNIQUE ("ride_id"), CONSTRAINT "CHK_ride_ratings_score" CHECK ("score" BETWEEN 1 AND 5), CONSTRAINT "PK_f42151954d19aea913b3f9352ec" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_ride_ratings_ride" ON "ride_ratings"  ("ride_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_threads" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ride_id" uuid NOT NULL, CONSTRAINT "REL_b69aea2549ce4818307a3b7b15" UNIQUE ("ride_id"), CONSTRAINT "PK_973a81c0adb9b18a5ea3ef95bf8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_chat_threads_ride" ON "chat_threads"  ("ride_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."chat_messages_sender_type_enum" AS ENUM('passenger', 'driver', 'system')`,
    );
    await queryRunner.query(
      `CREATE TABLE "chat_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "thread_id" uuid NOT NULL, "sender_type" "public"."chat_messages_sender_type_enum" NOT NULL, "sender_id" uuid, "body" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "read_at" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_40c55ee0e571e268b0d3cd37d10" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_chat_messages_thread_created" ON "chat_messages"  ("thread_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."places_kind_enum" AS ENUM('recent', 'popular', 'saved', 'airport', 'transit')`,
    );
    await queryRunner.query(
      `CREATE TABLE "places" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "title" character varying(120) NOT NULL, "address" character varying(255) NOT NULL, "postcode" character varying(16), "lat" double precision, "lng" double precision, "kind" "public"."places_kind_enum" NOT NULL DEFAULT 'popular', CONSTRAINT "PK_1afab86e226b4c3bc9a74465c12" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_places_postcode" ON "places"  ("postcode") `);
    await queryRunner.query(
      `CREATE TYPE "public"."pricing_rules_ride_type_enum" AS ENUM('standard', 'emergency', 'roadside')`,
    );
    await queryRunner.query(
      `CREATE TABLE "pricing_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ride_type" "public"."pricing_rules_ride_type_enum" NOT NULL, "base_fare_pence" integer NOT NULL, "per_mile_pence" integer NOT NULL DEFAULT '0', "minimum_fare_pence" integer NOT NULL DEFAULT '0', "later_booking_surcharge_bp" integer NOT NULL DEFAULT '0', "notes" character varying(255), "active" boolean NOT NULL DEFAULT true, "effective_from" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_pricing_non_negative" CHECK ("base_fare_pence" >= 0 AND "per_mile_pence" >= 0), CONSTRAINT "PK_fda27bb8db4630894decda61ff6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_log" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "actor_id" uuid, "action" character varying(64) NOT NULL, "entity" character varying(64) NOT NULL, "entity_id" character varying(64) NOT NULL, "payload" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_07fefa57f7f5ab8fc3f52b3ed0b" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_log_entity" ON "audit_log"  ("entity", "entity_id") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'paid', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "ride_id" uuid NOT NULL, "reference" character varying(32) NOT NULL, "amount_pence" integer NOT NULL, "status" "public"."payments_status_enum" NOT NULL DEFAULT 'pending', "method" character varying(32), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "REL_ab8f98d6ab110b8657d69dcebd" UNIQUE ("ride_id"), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_payments_ride" ON "payments"  ("ride_id") `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_payments_reference" ON "payments"  ("reference") `,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" ADD CONSTRAINT "FK_cec43742cd6dea0e8fcae3e29d8" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" ADD CONSTRAINT "FK_9c2e0a8772c9e43b32f57bfcfcc" FOREIGN KEY ("driver_id") REFERENCES "driver_profiles"("user_id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_documents" ADD CONSTRAINT "FK_dc156b37dfa0fcda0ef1974bab8" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_documents" ADD CONSTRAINT "FK_d311813e28302827396c9a583c4" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_locations" ADD CONSTRAINT "FK_096de534e1c6301cf7f2a4bf032" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "blocks" ADD CONSTRAINT "FK_00c17311ca1f500d4749aebcc91" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "blocks" ADD CONSTRAINT "FK_e97886330ed2d11bc753e2a46b3" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "alerts" ADD CONSTRAINT "FK_f1eba840c1761991f142affee66" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD CONSTRAINT "FK_d636b1caae832e7ed7c8413d99b" FOREIGN KEY ("passenger_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "rides" ADD CONSTRAINT "FK_fb13184768dea9734b022874c6f" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_stops" ADD CONSTRAINT "FK_0a43ad0cc5908f54070e7f01e23" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_offers" ADD CONSTRAINT "FK_d6b5e4d357eb886d83951cd9359" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_offers" ADD CONSTRAINT "FK_7aa752827b2405122f626a5b41d" FOREIGN KEY ("driver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_ratings" ADD CONSTRAINT "FK_a5afb75359a6be2111de1909699" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_ratings" ADD CONSTRAINT "FK_e942a26c26672509233e6809fa4" FOREIGN KEY ("rated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_threads" ADD CONSTRAINT "FK_b69aea2549ce4818307a3b7b159" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" ADD CONSTRAINT "FK_0b7e57fe586503d477a8d5adaed" FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" ADD CONSTRAINT "FK_15a6f5aad57db494c17986ed2e2" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_ab8f98d6ab110b8657d69dcebd0" FOREIGN KEY ("ride_id") REFERENCES "rides"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_ab8f98d6ab110b8657d69dcebd0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_log" DROP CONSTRAINT "FK_15a6f5aad57db494c17986ed2e2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_messages" DROP CONSTRAINT "FK_0b7e57fe586503d477a8d5adaed"`,
    );
    await queryRunner.query(
      `ALTER TABLE "chat_threads" DROP CONSTRAINT "FK_b69aea2549ce4818307a3b7b159"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_ratings" DROP CONSTRAINT "FK_e942a26c26672509233e6809fa4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_ratings" DROP CONSTRAINT "FK_a5afb75359a6be2111de1909699"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_offers" DROP CONSTRAINT "FK_7aa752827b2405122f626a5b41d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_offers" DROP CONSTRAINT "FK_d6b5e4d357eb886d83951cd9359"`,
    );
    await queryRunner.query(
      `ALTER TABLE "ride_stops" DROP CONSTRAINT "FK_0a43ad0cc5908f54070e7f01e23"`,
    );
    await queryRunner.query(`ALTER TABLE "rides" DROP CONSTRAINT "FK_fb13184768dea9734b022874c6f"`);
    await queryRunner.query(`ALTER TABLE "rides" DROP CONSTRAINT "FK_d636b1caae832e7ed7c8413d99b"`);
    await queryRunner.query(
      `ALTER TABLE "alerts" DROP CONSTRAINT "FK_f1eba840c1761991f142affee66"`,
    );
    await queryRunner.query(
      `ALTER TABLE "blocks" DROP CONSTRAINT "FK_e97886330ed2d11bc753e2a46b3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "blocks" DROP CONSTRAINT "FK_00c17311ca1f500d4749aebcc91"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_locations" DROP CONSTRAINT "FK_096de534e1c6301cf7f2a4bf032"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_documents" DROP CONSTRAINT "FK_d311813e28302827396c9a583c4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_documents" DROP CONSTRAINT "FK_dc156b37dfa0fcda0ef1974bab8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "vehicles" DROP CONSTRAINT "FK_9c2e0a8772c9e43b32f57bfcfcc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "driver_profiles" DROP CONSTRAINT "FK_cec43742cd6dea0e8fcae3e29d8"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_payments_reference"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_payments_ride"`);
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_log_entity"`);
    await queryRunner.query(`DROP TABLE "audit_log"`);
    await queryRunner.query(`DROP TABLE "pricing_rules"`);
    await queryRunner.query(`DROP TYPE "public"."pricing_rules_ride_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_places_postcode"`);
    await queryRunner.query(`DROP TABLE "places"`);
    await queryRunner.query(`DROP TYPE "public"."places_kind_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_chat_messages_thread_created"`);
    await queryRunner.query(`DROP TABLE "chat_messages"`);
    await queryRunner.query(`DROP TYPE "public"."chat_messages_sender_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_chat_threads_ride"`);
    await queryRunner.query(`DROP TABLE "chat_threads"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_ride_ratings_ride"`);
    await queryRunner.query(`DROP TABLE "ride_ratings"`);
    await queryRunner.query(`DROP TYPE "public"."ride_ratings_rated_by_role_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_ride_offers_ride"`);
    await queryRunner.query(`DROP TABLE "ride_offers"`);
    await queryRunner.query(`DROP TYPE "public"."ride_offers_response_enum"`);
    await queryRunner.query(`DROP TABLE "ride_stops"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_rides_status_requested"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_rides_driver_status"`);
    await queryRunner.query(`DROP TABLE "rides"`);
    await queryRunner.query(`DROP TYPE "public"."rides_priority_enum"`);
    await queryRunner.query(`DROP TYPE "public"."rides_vehicle_category_enum"`);
    await queryRunner.query(`DROP TYPE "public"."rides_booking_mode_enum"`);
    await queryRunner.query(`DROP TYPE "public"."rides_ride_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."rides_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_alerts_user_created"`);
    await queryRunner.query(`DROP TABLE "alerts"`);
    await queryRunner.query(`DROP TYPE "public"."alerts_type_enum"`);
    await queryRunner.query(`DROP TABLE "blocks"`);
    await queryRunner.query(`DROP TABLE "driver_locations"`);
    await queryRunner.query(`DROP TABLE "driver_documents"`);
    await queryRunner.query(`DROP TYPE "public"."driver_documents_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."driver_documents_type_enum"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_vehicles_plate"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_vehicles_driver"`);
    await queryRunner.query(`DROP TABLE "vehicles"`);
    await queryRunner.query(`DROP TYPE "public"."vehicles_category_enum"`);
    await queryRunner.query(`DROP TABLE "driver_profiles"`);
    await queryRunner.query(`DROP TYPE "public"."driver_profiles_online_status_enum"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_users_email"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."users_roles_enum"`);
  }
}
