-- S2, the hosted unsubscribe page: the webhook event `contact.resubscribed`.
--
-- A person who unsubscribed can opt back in through the signed hosted page
-- (src/routes/unsubscribe.ts). The client mirrors unsubscribes from
-- `contact.unsubscribed`, so it has to learn about the opt-in as well, or its
-- mirror keeps excluding someone who asked for mail again. The contract
-- (`WEBHOOK_EVENT_TYPES` in @marlinjai/mail-contract) gained the type; the CHECK
-- constraints of 0003 that mirror that enum are widened here to match.
--
-- The constraints are replaced, never edited in 0003, which is already applied.
-- Every value 0003 allowed stays allowed, so no existing row can fail them.

ALTER TABLE webhook_endpoints DROP CONSTRAINT webhook_endpoints_events_check;
ALTER TABLE webhook_endpoints ADD CONSTRAINT webhook_endpoints_events_check CHECK (
  cardinality(events) >= 1
  AND events <@ ARRAY['message.sent', 'message.failed', 'contact.unsubscribed', 'contact.resubscribed',
                      'contact.bounced', 'mailing.finished']::text[]
);

ALTER TABLE webhook_events DROP CONSTRAINT webhook_events_type_check;
ALTER TABLE webhook_events ADD CONSTRAINT webhook_events_type_check CHECK (
  type IN ('message.sent', 'message.failed', 'contact.unsubscribed', 'contact.resubscribed', 'contact.bounced',
           'mailing.finished')
);

ALTER TABLE webhook_deliveries DROP CONSTRAINT webhook_deliveries_event_type_check;
ALTER TABLE webhook_deliveries ADD CONSTRAINT webhook_deliveries_event_type_check CHECK (
  event_type IN ('message.sent', 'message.failed', 'contact.unsubscribed', 'contact.resubscribed', 'contact.bounced',
                 'mailing.finished')
);
