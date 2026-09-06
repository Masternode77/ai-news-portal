import data from '../../data/grid/demand.json';
import {csv} from '../../../scripts/lib/infrastructure-data.mjs';
export function GET(){return new Response(csv([['period_utc','balancing_authority','demand_mwh','source'],...data.records.map(r=>[r.period,r.respondent,r.value,data.sourceUrl])]),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="eia930-demand.csv"'}});}
