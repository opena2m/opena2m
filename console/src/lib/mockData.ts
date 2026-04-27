/**
 * Complete mock data — mirrors SQLAlchemy ORM field names exactly.
 * Reference: the uploaded mock console + AIMP spec scenarios.
 */

const m = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const h = (hr: number) => new Date(Date.now() - hr * 3_600_000).toISOString()
const d = (day: number) => new Date(Date.now() - day * 86_400_000).toISOString()

export type JobState = 'PENDING'|'QUOTED'|'LOCKED'|'EXECUTING'|'AUDITING'|'FULFILLING'|'COMPLETED'|'ABORTED'|'FAILED'

export interface Principal { principal_id:string; kind:'agent'|'human'|'system'; display_name:string; external_id:string|null; created_at:string; role?:string; last_active?:string }
export const PRINCIPALS: Principal[] = [
  { principal_id:'P001', kind:'agent',  display_name:'poster-agent',  external_id:'agent://alice/poster-agent', created_at:d(10), role:'Agent',    last_active:h(4) },
  { principal_id:'P002', kind:'human',  display_name:'bob@fab',        external_id:'human://bob@fab',            created_at:d(10), role:'Reviewer', last_active:h(0.5) },
  { principal_id:'P003', kind:'human',  display_name:'alice@fab',      external_id:'human://alice@fab',          created_at:d(10), role:'Admin',    last_active:h(2) },
  { principal_id:'P004', kind:'agent',  display_name:'fab-executor',   external_id:'agent://fab/executor',       created_at:d(10), role:'Agent',    last_active:m(20) },
  { principal_id:'P005', kind:'system', display_name:'gateway',        external_id:'system://gateway',           created_at:d(10), role:'System',   last_active:m(0.5) },
  { principal_id:'P006', kind:'agent',  display_name:'lab-agent',      external_id:'agent://lab/lab-agent',      created_at:d(5),  role:'Agent',    last_active:m(5) },
]
export const findPrincipal = (id:string) => PRINCIPALS.find(p=>p.principal_id===id) ?? { principal_id:id, kind:'system' as const, display_name:id, external_id:null, created_at:d(0) }

export interface DomainMeta { domain_id:string; adapter_package:string; adapter_version:string; registered_at:string; loaded?:boolean; risk_tier_default:string; device_count:number; schema_json:Record<string,unknown>; registered_sensors:{channel:string;unit:string;description:string}[]; registered_vision_checks:{name:string;description:string;sandbox:boolean}[]; error_codes:{code:string;description:string;category:string}[] }
export const DOMAINS: DomainMeta[] = [
  {
    domain_id:'manufacturing.print.2d.v1', adapter_package:'aimp-adapter-print2d-sim', adapter_version:'0.1.0',
    registered_at:d(10), loaded:true, risk_tier_default:'routine', device_count:1,
    schema_json:{ $schema:'https://json-schema.org/draft/2020-12/schema', title:'2D Print Job', description:'Schema for 2D cloud print jobs with optional shipping', type:'object', required:['asset_url','paper_size','copies'],
      properties:{ asset_url:{type:'string',format:'uri',description:'Signed URL of the print asset (PNG/PDF)'}, paper_size:{type:'string',enum:['A4','A3','A2','A1','Letter','Legal'],description:'Target paper size'}, copies:{type:'integer',minimum:1,maximum:100,description:'Number of copies'}, color_mode:{type:'string',enum:['color','grayscale','black_and_white'],default:'color'}, double_sided:{type:'boolean',default:false}, shipping_address:{type:'object',description:'Optional shipping address',properties:{name:{type:'string'},street:{type:'string'},city:{type:'string'},country:{type:'string'},postal_code:{type:'string'}}} } },
    registered_sensors:[{ channel:'printer.status',unit:'enum',description:'Printer operational status' },{ channel:'queue.length',unit:'count',description:'Current print queue depth' }],
    registered_vision_checks:[{ name:'detect_print_quality',description:'Check output for colour/alignment defects',sandbox:true }],
    error_codes:[{ code:'ERR_PRINT2D_PAPER_JAM',description:'Paper jam detected',category:'hardware_fault' },{ code:'ERR_PRINT2D_INK_LOW',description:'Ink level critically low',category:'consumable' },{ code:'ERR_PRINT2D_COURIER_UNAVAILABLE',description:'No courier available',category:'fulfillment' },{ code:'ERR_PRINT2D_ASSET_TOO_LARGE',description:'Asset exceeds max size',category:'validation' }]
  },
  {
    domain_id:'manufacturing.additive.fdm.v1', adapter_package:'aimp-adapter-fdm-sim', adapter_version:'0.1.0',
    registered_at:d(10), loaded:true, risk_tier_default:'restricted', device_count:2,
    schema_json:{ $schema:'https://json-schema.org/draft/2020-12/schema', title:'FDM 3D Print Job', description:'Schema for FDM 3D print jobs', type:'object', required:['gcode_url','material','layer_height_mm'],
      properties:{ gcode_url:{type:'string',format:'uri',description:'Signed URL of G-code file'}, material:{type:'string',enum:['PLA','PETG','ABS','TPU','ASA'],description:'Filament material'}, layer_height_mm:{type:'number',minimum:0.05,maximum:0.4,description:'Layer height (mm)'}, infill_percent:{type:'integer',minimum:0,maximum:100,default:20,description:'Infill density %'}, nozzle_temp_celsius:{type:'integer',minimum:180,maximum:280,description:'Nozzle temperature (°C)'}, bed_temp_celsius:{type:'integer',minimum:0,maximum:110,description:'Bed temperature (°C)'}, supports_enabled:{type:'boolean',default:false}, estimated_weight_g:{type:'number',description:'Estimated filament weight (g)'} } },
    registered_sensors:[{ channel:'extruder.temp',unit:'°C',description:'Nozzle/extruder temperature' },{ channel:'bed.temp',unit:'°C',description:'Build plate temperature' },{ channel:'chamber.temp',unit:'°C',description:'Chamber ambient temperature' },{ channel:'filament.remaining_g',unit:'g',description:'Filament remaining' }],
    registered_vision_checks:[{ name:'detect_spaghetti_failure',description:'Detect layer separation or spaghetti failure',sandbox:true },{ name:'detect_layer_adhesion',description:'Verify proper layer-to-layer adhesion',sandbox:false }],
    error_codes:[{ code:'ERR_FDM_NOZZLE_CLOG',description:'Nozzle clog detected',category:'hardware_fault' },{ code:'ERR_FDM_BED_ADHESION_FAIL',description:'Print lost bed adhesion',category:'process_fault' },{ code:'ERR_FDM_THERMAL_RUNAWAY',description:'Thermal runaway — emergency stop',category:'safety' },{ code:'ERR_FDM_FILAMENT_OUT',description:'Filament run-out detected',category:'consumable' },{ code:'ERR_FDM_LAYER_SHIFT',description:'Layer shift detected in X/Y',category:'process_fault' }]
  },
]
export const findDomain = (id:string) => DOMAINS.find(d=>d.domain_id===id)

export interface DeviceFull { device_id:string; display_name:string; vendor:string; model:string; firmware:string; location_json:{site:string;country:string}; risk_tier:string; conformance:string; status_json:{reachable:boolean;busy:boolean;queue_length:number;current_job_id:string|null}; capabilities_json:Record<string,unknown>; domains:string[]; created_at:string; disabled_at:string|null; stats24h:{jobs:number;success_pct:number;avg_min:number;uptime_pct:number}; consumables:{name:string;remaining:string;status:'ok'|'warn'|'critical'}[] }
export const DEVICES: DeviceFull[] = [
  { device_id:'cloudprint-sim-1', display_name:'Cloud Print Sim 1', vendor:'AIMP-Hub Sim', model:'cloudprint-sim', firmware:'0.1.0', location_json:{site:'Fab Floor A',country:'US'}, risk_tier:'routine', conformance:'L3', status_json:{reachable:true,busy:false,queue_length:2,current_job_id:null}, capabilities_json:{max_copies:100,paper_sizes:['A4','A3','A2','Letter'],color:true,courier:true}, domains:['manufacturing.print.2d.v1'], created_at:d(10), disabled_at:null, stats24h:{jobs:142,success_pct:99.3,avg_min:22,uptime_pct:99.9}, consumables:[{name:'Cyan Ink',remaining:'74%',status:'ok'},{name:'Magenta Ink',remaining:'61%',status:'ok'},{name:'Yellow Ink',remaining:'88%',status:'ok'},{name:'Black Ink',remaining:'43%',status:'warn'}] },
  { device_id:'fdm-sim-1', display_name:'FDM Sim 1', vendor:'AIMP-Hub Sim', model:'fdm-sim', firmware:'0.1.0', location_json:{site:'Fab Floor B',country:'US'}, risk_tier:'restricted', conformance:'L3', status_json:{reachable:true,busy:true,queue_length:1,current_job_id:'JOB001'}, capabilities_json:{build_volume_mm:[220,220,250],materials:['PLA','PETG','ABS'],max_temp:280}, domains:['manufacturing.additive.fdm.v1'], created_at:d(10), disabled_at:null, stats24h:{jobs:12,success_pct:83.3,avg_min:68,uptime_pct:99.1}, consumables:[{name:'PETG',remaining:'420g',status:'ok'},{name:'PLA',remaining:'80g',status:'warn'}] },
  { device_id:'fdm-sim-2', display_name:'FDM Sim 2', vendor:'AIMP-Hub Sim', model:'fdm-sim', firmware:'0.1.0', location_json:{site:'Fab Floor B',country:'US'}, risk_tier:'restricted', conformance:'L2', status_json:{reachable:false,busy:false,queue_length:0,current_job_id:null}, capabilities_json:{build_volume_mm:[220,220,250],materials:['PLA','PETG'],max_temp:260}, domains:['manufacturing.additive.fdm.v1'], created_at:d(5), disabled_at:null, stats24h:{jobs:0,success_pct:0,avg_min:0,uptime_pct:0}, consumables:[{name:'PLA',remaining:'1100g',status:'ok'}] },
]

export interface JobFull { job_id:string; quote_id:string|null; device_id:string; domain_id:string; principal_id:string; state:JobState; progress:number; payload_json:Record<string,unknown>; audit_requirements_json:Record<string,unknown>|null; asset_json:{url:string;hash:string;size_bytes:number}|null; cost_estimate:number|null; cost_actual:number|null; cost_currency:string; tracking_json:{carrier:string;tracking_number:string;url?:string;status:string}|null; error_json:{code:string;message:string;category:string;recoverable:boolean}|null; created_at:string; updated_at:string; version:number }
export const JOBS_INIT: JobFull[] = [
  { job_id:'JOB001', quote_id:'Q001', device_id:'fdm-sim-1', domain_id:'manufacturing.additive.fdm.v1', principal_id:'P004', state:'AUDITING', progress:0.50, payload_json:{gcode_url:'https://assets.example.com/gear-v3.gcode',material:'PETG',layer_height_mm:0.2,infill_percent:40,nozzle_temp_celsius:240,bed_temp_celsius:80,estimated_weight_g:42.5}, audit_requirements_json:{pause_for_human_at:['mid_build_50_percent']}, asset_json:{url:'https://assets.example.com/gear-v3.gcode',hash:'sha256:3f7a9b1c...',size_bytes:2847392}, cost_estimate:2.30, cost_actual:null, cost_currency:'USD', tracking_json:null, error_json:null, created_at:m(22), updated_at:m(1), version:5 },
  { job_id:'JOB002', quote_id:'Q002', device_id:'cloudprint-sim-1', domain_id:'manufacturing.print.2d.v1', principal_id:'P001', state:'COMPLETED', progress:1.0, payload_json:{asset_url:'https://assets.example.com/poster-cyberpunk-a3.png',paper_size:'A3',copies:1,color_mode:'color',shipping_address:{name:'Alice Smith',street:'123 Maker Lane',city:'San Francisco',country:'US',postal_code:'94107'}}, audit_requirements_json:null, asset_json:{url:'https://assets.example.com/poster-cyberpunk-a3.png',hash:'sha256:8e4c2d1a...',size_bytes:4182847}, cost_estimate:18.20, cost_actual:18.20, cost_currency:'USD', tracking_json:{carrier:'FedEx',tracking_number:'7489234789234',url:'https://fedex.com/track/7489234789234',status:'In Transit'}, error_json:null, created_at:h(4), updated_at:h(3.5), version:8 },
  { job_id:'JOB003', quote_id:'Q003', device_id:'cloudprint-sim-1', domain_id:'manufacturing.print.2d.v1', principal_id:'P001', state:'EXECUTING', progress:0.65, payload_json:{asset_url:'https://assets.example.com/report-q2.pdf',paper_size:'A4',copies:10,color_mode:'grayscale'}, audit_requirements_json:null, asset_json:{url:'https://assets.example.com/report-q2.pdf',hash:'sha256:2b9f7e4d...',size_bytes:897234}, cost_estimate:4.50, cost_actual:null, cost_currency:'USD', tracking_json:null, error_json:null, created_at:m(45), updated_at:m(2), version:4 },
  { job_id:'JOB004', quote_id:'Q004', device_id:'fdm-sim-1', domain_id:'manufacturing.additive.fdm.v1', principal_id:'P004', state:'FAILED', progress:0.23, payload_json:{gcode_url:'https://assets.example.com/bracket-v1.gcode',material:'ABS',layer_height_mm:0.15,infill_percent:60,nozzle_temp_celsius:250,bed_temp_celsius:100}, audit_requirements_json:null, asset_json:{url:'https://assets.example.com/bracket-v1.gcode',hash:'sha256:1c5d8f3e...',size_bytes:1293847}, cost_estimate:3.10, cost_actual:null, cost_currency:'USD', tracking_json:null, error_json:{code:'ERR_FDM_THERMAL_RUNAWAY',message:'Thermal runaway detected at layer 45 — emergency stop triggered',category:'safety',recoverable:false}, created_at:d(1), updated_at:h(20), version:6 },
  { job_id:'JOB005', quote_id:null, device_id:'cloudprint-sim-1', domain_id:'manufacturing.print.2d.v1', principal_id:'P006', state:'PENDING', progress:0, payload_json:{asset_url:'https://assets.example.com/lab-label.png',paper_size:'A4',copies:50}, audit_requirements_json:null, asset_json:null, cost_estimate:null, cost_actual:null, cost_currency:'USD', tracking_json:null, error_json:null, created_at:m(5), updated_at:m(5), version:1 },
  { job_id:'JOB006', quote_id:'Q006', device_id:'fdm-sim-1', domain_id:'manufacturing.additive.fdm.v1', principal_id:'P004', state:'ABORTED', progress:0.15, payload_json:{gcode_url:'https://assets.example.com/prototype-v2.gcode',material:'PLA',layer_height_mm:0.2,infill_percent:15,nozzle_temp_celsius:210,bed_temp_celsius:60}, audit_requirements_json:null, asset_json:{url:'https://assets.example.com/prototype-v2.gcode',hash:'sha256:5d3b1f7a...',size_bytes:738294}, cost_estimate:1.80, cost_actual:null, cost_currency:'USD', tracking_json:null, error_json:{code:'USER_ABORT',message:'Aborted by operator bob@fab',category:'user_action',recoverable:true}, created_at:h(6), updated_at:h(5.5), version:4 },
  { job_id:'JOB007', quote_id:'Q007', device_id:'cloudprint-sim-1', domain_id:'manufacturing.print.2d.v1', principal_id:'P001', state:'FULFILLING', progress:1.0, payload_json:{asset_url:'https://assets.example.com/flyer-event.png',paper_size:'A4',copies:25,color_mode:'color'}, audit_requirements_json:null, asset_json:{url:'https://assets.example.com/flyer-event.png',hash:'sha256:9e2a4b6c...',size_bytes:2384729}, cost_estimate:12.50, cost_actual:12.50, cost_currency:'USD', tracking_json:{carrier:'UPS',tracking_number:'1Z999AA10123456784',status:'Processing'}, error_json:null, created_at:h(1), updated_at:m(10), version:7 },
]

export interface JobTransition { id:number; from_state:string|null; to_state:string; at:string; by_principal_id:string; reason:string; details_json:Record<string,unknown>; signature:string }
export const JOB_TRANSITIONS: Record<string,JobTransition[]> = {
  JOB001:[
    {id:1,from_state:null,to_state:'PENDING',at:m(22),by_principal_id:'P004',reason:'Job submitted',details_json:{source:'MCP Bridge',aimp_version:'1.0.0-draft'},signature:'ed25519:3f9a2b1c...'},
    {id:2,from_state:'PENDING',to_state:'QUOTED',at:m(21.5),by_principal_id:'P005',reason:'Quote generated',details_json:{quote_id:'Q001',cost:2.30,duration_s:1200,risk_tier:'restricted'},signature:'ed25519:7b4e8d2f...'},
    {id:3,from_state:'QUOTED',to_state:'LOCKED',at:m(20),by_principal_id:'P004',reason:'Execute requested with approval token',details_json:{quote_id:'Q001',approval_token:'tok_01J8...',budget_reserved:2.30},signature:'ed25519:1c5f9e3a...'},
    {id:4,from_state:'LOCKED',to_state:'EXECUTING',at:m(19.5),by_principal_id:'P005',reason:'Adapter start() returned successfully',details_json:{adapter:'aimp-adapter-fdm-sim@0.1.0',device:'fdm-sim-1'},signature:'ed25519:6d2b8f4e...'},
    {id:5,from_state:'EXECUTING',to_state:'AUDITING',at:m(1),by_principal_id:'P005',reason:'Scheduled pause: mid_build_50_percent reached',details_json:{trigger:'mid_build_50_percent',progress:0.50,last_vision:'warn:0.61'},signature:'ed25519:2e7c1a5d...'},
  ],
  JOB002:[
    {id:6,from_state:null,to_state:'PENDING',at:h(4.2),by_principal_id:'P001',reason:'Job submitted',details_json:{},signature:'ed25519:4a8b3c6e...'},
    {id:7,from_state:'PENDING',to_state:'QUOTED',at:h(4.15),by_principal_id:'P005',reason:'Quote generated',details_json:{cost:18.20,duration_s:600,risk_tier:'routine'},signature:'ed25519:9f2d1b7a...'},
    {id:8,from_state:'QUOTED',to_state:'LOCKED',at:h(4.1),by_principal_id:'P001',reason:'Execute requested',details_json:{budget_reserved:18.20},signature:'ed25519:5c3e9d1f...'},
    {id:9,from_state:'LOCKED',to_state:'EXECUTING',at:h(4),by_principal_id:'P005',reason:'Adapter start() returned successfully',details_json:{adapter:'aimp-adapter-print2d-sim@0.1.0'},signature:'ed25519:8b1a4e2c...'},
    {id:10,from_state:'EXECUTING',to_state:'FULFILLING',at:h(3.8),by_principal_id:'P005',reason:'Print complete, dispatching courier',details_json:{tracking:'7489234789234',carrier:'FedEx'},signature:'ed25519:3d7f2c5a...'},
    {id:11,from_state:'FULFILLING',to_state:'COMPLETED',at:h(3.5),by_principal_id:'P005',reason:'FedEx tracking confirmed, cost settled',details_json:{cost_actual:18.20,settled:true},signature:'ed25519:6e1b8a3d...'},
  ],
  JOB004:[
    {id:12,from_state:null,to_state:'PENDING',at:d(1.1),by_principal_id:'P004',reason:'Job submitted',details_json:{},signature:'ed25519:2f4c7b9e...'},
    {id:13,from_state:'PENDING',to_state:'QUOTED',at:d(1.09),by_principal_id:'P005',reason:'Quote generated',details_json:{cost:3.10,risk_tier:'restricted'},signature:'ed25519:7a9d3c1f...'},
    {id:14,from_state:'QUOTED',to_state:'LOCKED',at:d(1.08),by_principal_id:'P004',reason:'Execute requested',details_json:{},signature:'ed25519:1e5b8d2c...'},
    {id:15,from_state:'LOCKED',to_state:'EXECUTING',at:d(1.07),by_principal_id:'P005',reason:'Adapter start() returned',details_json:{},signature:'ed25519:4f2a7e9b...'},
    {id:16,from_state:'EXECUTING',to_state:'FAILED',at:h(20),by_principal_id:'P005',reason:'ERR_FDM_THERMAL_RUNAWAY',details_json:{code:'ERR_FDM_THERMAL_RUNAWAY',layer:45,temp_reading:312},signature:'ed25519:8c3d1f6a...'},
  ],
}

const genHist = (base:number,v:number,n:number) => Array.from({length:n},(_,i)=>({v:base+(Math.random()-0.5)*v*2,t:m(n-i)}))
export interface VisionCheck { id:string; check_name:string; verdict:'pass'|'warn'|'fail'|'inconclusive'; confidence:number; at:string; signed_by:string; evidence_json:Record<string,unknown>|null; recommended_action:string|null }
export interface SensorReading { channel:string; value:number; unit:string; quality:'ok'|'degraded'|'stale'|'error'; at:string }
export interface MediaItem { id:string; channel:string; mime:string; captured_at:string; signature:string }
export interface JobTelemetry { sensors:SensorReading[]; history:Record<string,{v:number;t:string}[]>; media:MediaItem[]; vision_checks:VisionCheck[] }
export const TELEMETRY: Record<string,JobTelemetry> = {
  JOB001:{ sensors:[{channel:'extruder.temp',value:240.1,unit:'°C',quality:'ok',at:m(0.1)},{channel:'bed.temp',value:79.8,unit:'°C',quality:'ok',at:m(0.1)},{channel:'chamber.temp',value:35.2,unit:'°C',quality:'ok',at:m(0.1)},{channel:'filament.remaining_g',value:892.5,unit:'g',quality:'ok',at:m(0.1)}], history:{'extruder.temp':genHist(240,3,22),'bed.temp':genHist(80,2,22),'chamber.temp':genHist(35,1.5,22)}, media:[{id:'M001',channel:'camera.top',mime:'image/jpeg',captured_at:m(1),signature:'ed25519:9a2b...'},{id:'M002',channel:'camera.top',mime:'image/jpeg',captured_at:m(6),signature:'ed25519:3c4d...'},{id:'M003',channel:'camera.top',mime:'image/jpeg',captured_at:m(11),signature:'ed25519:5e6f...'},{id:'M004',channel:'camera.top',mime:'image/jpeg',captured_at:m(16),signature:'ed25519:7a8b...'}], vision_checks:[{id:'VC001',check_name:'detect_spaghetti_failure',verdict:'pass',confidence:0.94,at:m(1),signed_by:'vision-runner@gateway',evidence_json:null,recommended_action:null},{id:'VC002',check_name:'detect_spaghetti_failure',verdict:'pass',confidence:0.92,at:m(6),signed_by:'vision-runner@gateway',evidence_json:null,recommended_action:null},{id:'VC003',check_name:'detect_spaghetti_failure',verdict:'warn',confidence:0.61,at:m(11),signed_by:'vision-runner@gateway',evidence_json:{bbox:[0.2,0.3,0.4,0.5],description:'Minor filament deviation at layer boundary'},recommended_action:'Monitor closely — not critical but watch next frame'},{id:'VC004',check_name:'detect_layer_adhesion',verdict:'pass',confidence:0.88,at:m(16),signed_by:'vision-runner@gateway',evidence_json:null,recommended_action:null}] },
  JOB003:{ sensors:[{channel:'printer.status',value:1,unit:'enum',quality:'ok',at:m(0.1)},{channel:'queue.length',value:1,unit:'count',quality:'ok',at:m(0.1)}], history:{'printer.status':genHist(1,0,10)}, media:[], vision_checks:[] },
}

export interface PolicyFull { policy_id:string; name:string; enabled:boolean; rules_yaml:string; version:number; updated_at:string; updated_by:string; matches_today:number }
export const POLICIES_INIT: PolicyFull[] = [
  {policy_id:'POL001',name:'default-deny-hazardous',enabled:true,rules_yaml:`id: default-deny-hazardous\nenabled: true\ndescription: "Reject all hazardous-tier jobs"\nwhen:\n  risk_tier: hazardous\ndecision: DENY\nreason: "Hazardous tier requires explicit override"`,version:1,updated_at:d(2),updated_by:'P003',matches_today:0},
  {policy_id:'POL002',name:'restricted-needs-hitl',enabled:true,rules_yaml:`id: restricted-needs-hitl\nenabled: true\ndescription: "Restricted jobs require human review at 50%"\nwhen:\n  risk_tier: restricted\n  domain_match: "manufacturing.*"\ndecision: REQUIRE_APPROVAL\napprovals:\n  - principal_kind: human\n    role: reviewer\nhitl:\n  pause_for_human_at:\n    - mid_build_50_percent`,version:2,updated_at:d(2),updated_by:'P003',matches_today:12},
  {policy_id:'POL003',name:'budget-poster-agent-daily',enabled:true,rules_yaml:`id: budget-poster-agent-daily\nenabled: true\ndescription: "Daily spend cap for Alice poster agent"\nwhen:\n  principal_id: "agent://alice/poster-agent"\ndecision: ALLOW\nbudget:\n  ceiling: 50.00\n  currency: USD\n  window: daily\n  hard_deny: true`,version:1,updated_at:d(1),updated_by:'P003',matches_today:19},
  {policy_id:'POL004',name:'allow-poster-agent-print2d',enabled:true,rules_yaml:`id: allow-poster-agent-print2d\nenabled: true\ndescription: "Allow poster agent to run routine 2D print jobs"\nwhen:\n  principal_id: "agent://alice/poster-agent"\n  domain_match: "manufacturing.print.2d.v1"\n  risk_tier: routine\ndecision: ALLOW\nasset_checks:\n  - max_file_size_mb: 50`,version:3,updated_at:h(6),updated_by:'P003',matches_today:142},
]

export interface PolicyTraceStep { step:number; name:string; description:string; decision:'ALLOW'|'DENY'|'REQUIRE_APPROVAL'|'SKIP'; rule:string; inputs:Record<string,unknown> }
export const POLICY_TRACE_JOB001: PolicyTraceStep[] = [
  {step:1,name:'domain_permission',description:'Does caller token scope include this domain?',decision:'ALLOW',rule:'Token scope: manufacturing.additive.fdm.v1 ✓',inputs:{principal:'P004',domain:'manufacturing.additive.fdm.v1'}},
  {step:2,name:'device_access',description:'Does token scope include this device?',decision:'ALLOW',rule:'Token scope: device:fdm-sim-1 ✓',inputs:{device:'fdm-sim-1'}},
  {step:3,name:'risk_tier_allowed',description:'Is risk tier enabled for this environment?',decision:'ALLOW',rule:'restricted tier: permitted',inputs:{risk_tier:'restricted'}},
  {step:4,name:'budget_available',description:'Is there room under the principal budget?',decision:'ALLOW',rule:'Budget: $6.40/$100.00 used. $2.30 fits.',inputs:{consumed:6.40,ceiling:100.00,request:2.30}},
  {step:5,name:'approval_required',description:'Does any rule require HITL approval?',decision:'REQUIRE_APPROVAL',rule:'restricted-needs-hitl: REQUIRE_APPROVAL',inputs:{matched_policy:'POL002'}},
  {step:6,name:'asset_policy',description:'Does the asset pass content rules?',decision:'ALLOW',rule:'G-code: MIME ok, size 2.8MB < 50MB limit',inputs:{mime:'application/octet-stream',size_bytes:2847392}},
]

export interface BudgetFull { budget_id:string; principal_id:string; scope_domain_id:string|null; ceiling_amount:number; ceiling_currency:string; window_kind:string; warn_at_percent:number; hard_deny:boolean; consumed:number; window_starts_at:string; window_resets_at:string; history:{day:string;amount:number}[] }
export const BUDGETS_INIT: BudgetFull[] = [
  {budget_id:'BUD001',principal_id:'P001',scope_domain_id:null,ceiling_amount:50.00,ceiling_currency:'USD',window_kind:'daily',warn_at_percent:80,hard_deny:true,consumed:4.32,window_starts_at:new Date(new Date().setHours(0,0,0,0)).toISOString(),window_resets_at:new Date(new Date(new Date().setHours(0,0,0,0)).getTime()+86400000).toISOString(),history:Array.from({length:30},(_,i)=>({day:d(29-i),amount:Math.random()*12}))},
  {budget_id:'BUD002',principal_id:'P004',scope_domain_id:'manufacturing.additive.fdm.v1',ceiling_amount:100.00,ceiling_currency:'USD',window_kind:'weekly',warn_at_percent:80,hard_deny:true,consumed:6.40,window_starts_at:d(3),window_resets_at:new Date(Date.now()+4*86400000).toISOString(),history:Array.from({length:7},(_,i)=>({day:d(6-i),amount:Math.random()*30}))},
  {budget_id:'BUD003',principal_id:'P006',scope_domain_id:null,ceiling_amount:20.00,ceiling_currency:'USD',window_kind:'monthly',warn_at_percent:80,hard_deny:false,consumed:18.50,window_starts_at:new Date(new Date().setDate(1)).toISOString(),window_resets_at:new Date(new Date(new Date().setDate(1)).setMonth(new Date().getMonth()+1)).toISOString(),history:Array.from({length:25},(_,i)=>({day:d(24-i),amount:Math.random()*3}))},
]

export interface AuditEntry { id:number; at:string; principal_id:string; action:string; target_kind:string; target_id:string; details_json:Record<string,unknown>; prev_hash:string; signature:string }
export const AUDIT_LOG_INIT: AuditEntry[] = [
  {id:1,at:m(1),principal_id:'P005',action:'job.state_transition',target_kind:'job',target_id:'JOB001',details_json:{from:'EXECUTING',to:'AUDITING',reason:'mid_build_50_percent'},prev_hash:'sha256:a3f9b2c1...',signature:'ed25519:abc123...'},
  {id:2,at:m(2),principal_id:'P005',action:'vision.check_completed',target_kind:'job',target_id:'JOB001',details_json:{check:'detect_spaghetti_failure',verdict:'warn',confidence:0.61},prev_hash:'sha256:b4e8c3d2...',signature:'ed25519:def456...'},
  {id:3,at:m(7),principal_id:'P005',action:'vision.check_completed',target_kind:'job',target_id:'JOB001',details_json:{check:'detect_spaghetti_failure',verdict:'pass',confidence:0.92},prev_hash:'sha256:c5f9d4e3...',signature:'ed25519:ghi789...'},
  {id:4,at:m(19),principal_id:'P004',action:'job.execute',target_kind:'job',target_id:'JOB001',details_json:{quote_id:'Q001',domain:'manufacturing.additive.fdm.v1',approval_token:'tok_01J8...'},prev_hash:'sha256:d6g0e5f4...',signature:'ed25519:jkl012...'},
  {id:5,at:h(3.5),principal_id:'P005',action:'job.state_transition',target_kind:'job',target_id:'JOB002',details_json:{from:'FULFILLING',to:'COMPLETED',cost_actual:18.20},prev_hash:'sha256:e7h1f6g5...',signature:'ed25519:mno345...'},
  {id:6,at:h(4),principal_id:'P001',action:'job.execute',target_kind:'job',target_id:'JOB002',details_json:{quote_id:'Q002',domain:'manufacturing.print.2d.v1'},prev_hash:'sha256:f8i2g7h6...',signature:'ed25519:pqr678...'},
  {id:7,at:h(20),principal_id:'P005',action:'job.state_transition',target_kind:'job',target_id:'JOB004',details_json:{from:'EXECUTING',to:'FAILED',code:'ERR_FDM_THERMAL_RUNAWAY'},prev_hash:'sha256:g9j3h8i7...',signature:'ed25519:stu901...'},
  {id:8,at:d(1),principal_id:'P003',action:'policy.update',target_kind:'policy',target_id:'POL004',details_json:{version:3,summary:'Added asset content checks'},prev_hash:'sha256:h0k4i9j8...',signature:'ed25519:vwx234...'},
  {id:9,at:d(2),principal_id:'P003',action:'key.rotation',target_kind:'gateway',target_id:'gw-1',details_json:{new_fp:'SHA256:3vNa7+kP...',old_fp:'SHA256:7bXk2/mN...'},prev_hash:'sha256:i1l5j0k9...',signature:'ed25519:yza567...'},
  {id:10,at:d(2),principal_id:'P003',action:'budget.created',target_kind:'budget',target_id:'BUD001',details_json:{ceiling:50.00,window:'daily',principal:'P001'},prev_hash:'sha256:j2m6k1l0...',signature:'ed25519:bcd890...'},
  {id:11,at:h(5.5),principal_id:'P002',action:'job.resume.abort',target_kind:'job',target_id:'JOB006',details_json:{decision:'ABORT',note:'Proto looks fine but stopping to recheck slicing',job_version:3},prev_hash:'sha256:k3n7l2m1...',signature:'ed25519:efg123...'},
  {id:12,at:h(6),principal_id:'P004',action:'job.execute',target_kind:'job',target_id:'JOB006',details_json:{quote_id:'Q006',domain:'manufacturing.additive.fdm.v1'},prev_hash:'sha256:l4o8m3n2...',signature:'ed25519:hij456...'},
]

export const WEBHOOKS_INIT = [
  {endpoint_id:'WH001',url:'https://hooks.example.com/aimp-jobs',events_json:['job.state_transition','job.completed','budget.warning'],disabled_at:null,deliveries_today:142,failures_today:0,last_delivery:m(1)},
  {endpoint_id:'WH002',url:'https://hooks.slack.com/services/T00/B00/XXXX',events_json:['human_action_required','job.failed','budget.exceeded'],disabled_at:null,deliveries_today:3,failures_today:0,last_delivery:h(1)},
  {endpoint_id:'WH003',url:'https://n8n.legacy.example.com/webhook/aimp-catchall',events_json:['*'],disabled_at:d(3),deliveries_today:0,failures_today:0,last_delivery:d(4)},
]
export const SIGNING_KEYS_INIT = [
  {key_id:'KEY001',fingerprint:'SHA256:3vNa7+kPqLxWzR8mYhBvCdFjKsEi6oUt1nMgAp4Qe0Y=',created_at:d(2),status:'active',purpose:'audit_signing'},
  {key_id:'KEY002',fingerprint:'SHA256:7bXk2/mNqJyUoS3hIwDpEcGlHtFv9eRa5nBsMi0Qz1W=',created_at:d(60),status:'verification-only',purpose:'audit_signing'},
]
