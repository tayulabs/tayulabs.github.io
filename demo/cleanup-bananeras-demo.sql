-- Limpieza segura de datos del demo comercial de Bananeras
-- Marcador único: TAYU_DEMO_BANANERAS_V1
-- Ejecutar en la base tayu_platform cuando se desee retirar el demo.

BEGIN;

DELETE FROM banana_boxes
WHERE notes = 'TAYU_DEMO_BANANERAS_V1';

DELETE FROM banana_pallets
WHERE notes = 'TAYU_DEMO_BANANERAS_V1';

DELETE FROM banana_dispatches
WHERE notes = 'TAYU_DEMO_BANANERAS_V1';

DELETE FROM banana_quality_checks
WHERE notes = 'TAYU_DEMO_BANANERAS_V1';

DELETE FROM banana_weighings
WHERE notes = 'TAYU_DEMO_BANANERAS_V1';

DELETE FROM banana_packing_sessions
WHERE notes = 'TAYU_DEMO_BANANERAS_V1';

DELETE FROM banana_harvest_orders
WHERE notes = 'TAYU_DEMO_BANANERAS_V1';

DELETE FROM banana_crew_members
WHERE crew_id IN (
  SELECT id
  FROM banana_crews
  WHERE notes = 'TAYU_DEMO_BANANERAS_V1'
);

DELETE FROM banana_crews
WHERE notes = 'TAYU_DEMO_BANANERAS_V1';

DELETE FROM banana_workers
WHERE notes = 'TAYU_DEMO_BANANERAS_V1';

DELETE FROM banana_lots
WHERE notes = 'TAYU_DEMO_BANANERAS_V1';

COMMIT;

-- Verificación opcional:
-- SELECT 'lots',count(*) FROM banana_lots WHERE notes='TAYU_DEMO_BANANERAS_V1'
-- UNION ALL SELECT 'workers',count(*) FROM banana_workers WHERE notes='TAYU_DEMO_BANANERAS_V1'
-- UNION ALL SELECT 'crews',count(*) FROM banana_crews WHERE notes='TAYU_DEMO_BANANERAS_V1'
-- UNION ALL SELECT 'harvest',count(*) FROM banana_harvest_orders WHERE notes='TAYU_DEMO_BANANERAS_V1'
-- UNION ALL SELECT 'packing',count(*) FROM banana_packing_sessions WHERE notes='TAYU_DEMO_BANANERAS_V1'
-- UNION ALL SELECT 'weighings',count(*) FROM banana_weighings WHERE notes='TAYU_DEMO_BANANERAS_V1'
-- UNION ALL SELECT 'quality',count(*) FROM banana_quality_checks WHERE notes='TAYU_DEMO_BANANERAS_V1'
-- UNION ALL SELECT 'boxes',count(*) FROM banana_boxes WHERE notes='TAYU_DEMO_BANANERAS_V1'
-- UNION ALL SELECT 'pallets',count(*) FROM banana_pallets WHERE notes='TAYU_DEMO_BANANERAS_V1'
-- UNION ALL SELECT 'dispatches',count(*) FROM banana_dispatches WHERE notes='TAYU_DEMO_BANANERAS_V1';
