import data from '../../data/grid/ercot.json';
import {csv} from '../../../scripts/lib/infrastructure-data.mjs';
export function GET(){return new Response(csv([['as_of','stage','gw','source'],...data.stages.map(r=>[data.asOf,r.stage,r.value,data.sourceUrl])]),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="ercot-large-load-snapshot.csv"'}});}
