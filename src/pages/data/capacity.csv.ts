import data from '../../data/grid/capacity.json';
import {csv} from '../../../scripts/lib/infrastructure-data.mjs';
export function GET(){return new Response(csv([['inventory_month','plant_id','generator_id','state','technology','planned_year','planned_month','net_summer_mw','status','source'],...data.records.map(r=>[data.asOf,r.plantId,r.generatorId,r.state,r.technology,r.year,r.month,r.netSummerMW,r.status,data.sourceUrl])]),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="eia860m-planned.csv"'}});}
