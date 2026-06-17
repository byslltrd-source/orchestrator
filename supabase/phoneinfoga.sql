-- PHONEINFOGA tool registry seed
insert into public.tools (name, description, is_proprietary, tier, parameters) values
  (
    'phoneinfoga',
    'PROPRIETARY Orchestrator module — Line Intelligence & Number Footprint via self-hosted PhoneInfoga engine. Validate lines, run OSINT scanners, generate CIRCL-ready footprint reports. Public OSINT only; no real-time tracking.',
    true,
    'proprietary_ultra',
    '{"type":"object","properties":{"action":{"type":"string","enum":["validate","list_scanners","run_scanner","full_scan","footprint_report"]},"phone_number":{"type":"string"},"scanner":{"type":"string"},"subject_name":{"type":"string"}},"required":["action","phone_number"]}'
  )
on conflict (name) do update set
  description = excluded.description,
  is_proprietary = excluded.is_proprietary,
  tier = excluded.tier,
  parameters = excluded.parameters,
  updated_at = now();