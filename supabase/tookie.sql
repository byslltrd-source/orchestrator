insert into public.tools (name, description, is_proprietary, tier, parameters) values
  (
    'tookie',
    'PROPRIETARY Orchestrator module — Username & social footprint via self-hosted Tookie-OSINT engine. Discovers public account URLs across sites for PROVISO CIRCL officer/confidant/associate dossiers.',
    true,
    'proprietary_ultra',
    '{"type":"object","properties":{"action":{"type":"string","enum":["health","scan","footprint_report","scan_aliases"]},"username":{"type":"string"},"aliases":{"type":"array","items":{"type":"string"}},"subject_name":{"type":"string"},"threads":{"type":"number"}},"required":["action"]}'
  )
on conflict (name) do update set
  description = excluded.description,
  is_proprietary = excluded.is_proprietary,
  tier = excluded.tier,
  parameters = excluded.parameters,
  updated_at = now();