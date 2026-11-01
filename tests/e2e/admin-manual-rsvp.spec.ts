import { test, expect, type Page } from '@playwright/test';
import type { AdminInvitation } from '../../supabase/functions/_shared/contracts';
const id='00000000-0000-4000-8000-000000000001';

async function setup(page:Page) {
  const now=new Date().toISOString();
  const state={responseCalls:0,failResponse:false,rows:[{id,full_name:'Persona sin teléfono',phone:'',expires_at:'2026-01-01T00:00:00Z',created_at:now,updated_at:now,sent_at:null,archived_at:null,revoked:false,status:'pending',notes:'Nota del invitado',responded_at:null},
    {id:'00000000-0000-4000-8000-000000000002',full_name:'Persona con teléfono',phone:'+50688888888',expires_at:'2027-01-01T23:59:59-06:00',created_at:now,updated_at:now,sent_at:null,archived_at:null,revoked:false,status:'pending',notes:'',responded_at:null}] as AdminInvitation[]};
  const jwt=[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})).toString('base64url'),'signature'].join('.');
  await page.route('**/auth/v1/token?**',route=>route.fulfill({json:{access_token:jwt,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user:{id,aud:'authenticated',email:'admin@example.test',app_metadata:{},user_metadata:{},created_at:now}}}));
  await page.route('**/functions/v1/wedding-api',async route=>{
    expect(route.request().headers().authorization).toBe(`Bearer ${jwt}`);
    const input=route.request().postDataJSON();
    if(input.action==='list')return route.fulfill({json:{invitations:state.rows,fetched_at:new Date().toISOString(),metrics:{total:2,sent:0,accepted:state.rows.filter(row=>row.status==='accepted').length,declined:state.rows.filter(row=>row.status==='declined').length,pending:state.rows.filter(row=>row.status==='pending').length,response_rate:state.rows.filter(row=>row.status!=='pending').length/2*100},seating:{tables:[{id:'10000000-0000-4000-8000-000000000001',name:'Mesa Manual',capacity:2,created_at:now,updated_at:now}],assignments:[{invitation_id:id,table_id:'10000000-0000-4000-8000-000000000001',assigned_at:now}]}}});
    if(input.action==='admin_respond'){
      expect(Object.keys(input).sort()).toEqual(['action','id','status']);state.responseCalls++;
      if(state.failResponse){state.failResponse=false;return route.fulfill({status:503,json:{error:'UNAVAILABLE'}});}
      const row=state.rows.find(row=>row.id===input.id)!;row.status=input.status;row.responded_at=now;row.updated_at=new Date().toISOString();
      return route.fulfill({json:{id:row.id,status:row.status}});
    }
    if(input.action==='rotate')return route.fulfill({json:{id:input.id,token:(input.id===id?'c':'d').repeat(64)}});
    throw new Error(`Unexpected action ${input.action}`);
  });
  await page.goto('/admin/');await page.getByLabel('Correo').fill('admin@example.test');await page.getByLabel('Contraseña').fill('test-password');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await page.getByRole('button',{name:'Ver invitados',exact:true}).click();
  return state;
}
async function navigate(page:Page,isMobile:boolean,name:string){
  if(isMobile)await page.getByRole('button',{name:'Menú',exact:true}).click();
  await page.getByRole('navigation',{name:'Navegación de administración'}).getByRole('button',{name:name==='Invitados'?/^Invitados(?: \d+)?$/:name,exact:true}).click();
}

test('administrator can confirm an offline guest, correct the answer and update seating',async({page,isMobile})=>{
  const state=await setup(page);
  const row=page.getByRole('row').filter({has:page.getByRole('cell',{name:/Persona sin teléfono/})});
  await row.getByRole('button',{name:'Confirmar manualmente',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Registrar respuesta manual',exact:true});
  await expect(dialog).toContainText('Persona sin teléfono');
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();expect(state.responseCalls).toBe(0);
  await row.getByRole('button',{name:'Confirmar manualmente',exact:true}).click();
  await expect(dialog.getByRole('radio',{name:'Sí, asistirá',exact:true})).toBeChecked();
  state.failResponse=true;
  await dialog.getByRole('button',{name:'Guardar respuesta',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();
  await dialog.getByRole('button',{name:'Guardar respuesta',exact:true}).click();await expect(dialog).not.toBeVisible();
  await expect(row.locator('.status-badge')).toHaveText('Confirmado');await expect(row).toContainText('Nota del invitado');
  expect(state.rows[0].phone).toBe('');
  await navigate(page,isMobile,'Mesas');await expect(page.getByRole('button',{name:/^Mesa Manual,/})).toContainText('Confirmados: 1');
  await navigate(page,isMobile,'Invitados');await row.getByRole('button',{name:'Cambiar respuesta',exact:true}).click();
  await dialog.getByRole('radio',{name:'No asistirá',exact:true}).check();await dialog.getByRole('button',{name:'Guardar respuesta',exact:true}).click();
  await expect(row.locator('.status-badge')).toHaveText('No asistirá');
  await navigate(page,isMobile,'Mesas');await expect(page.locator('.admin-seat-warning')).toBeVisible();
  expect(state.responseCalls).toBe(3);
});

test('emoji actions remain labeled and WhatsApp is absent for guests without a phone',async({page})=>{
  await setup(page);page.on('dialog',dialog=>dialog.accept());
  const without=page.getByRole('row').filter({has:page.getByRole('cell',{name:/Persona sin teléfono/})});
  await without.getByRole('button',{name:'Generar enlace nuevo',exact:true}).click();await expect(without.getByRole('button',{name:'Copiar',exact:true})).toBeVisible();
  await expect(without.getByRole('link',{name:'WhatsApp',exact:true})).toHaveCount(0);
  const withPhone=page.getByRole('row').filter({has:page.getByRole('cell',{name:/Persona con teléfono/})});
  await withPhone.getByRole('button',{name:'Generar enlace nuevo',exact:true}).click();
  await expect(withPhone.getByRole('link',{name:'WhatsApp',exact:true})).toHaveAttribute('href',/^https:\/\/wa\.me\/50688888888\?text=/);
  await expect(withPhone.getByRole('button',{name:'Editar',exact:true})).toContainText('✏️');
  await expect(withPhone.getByRole('button',{name:'Confirmar manualmente',exact:true})).toContainText('✅');
  await withPhone.locator('.admin-actions').screenshot({path:`.tools/admin-emoji-actions-${test.info().project.name}.png`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
