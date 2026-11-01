import { test, expect, type Page } from '@playwright/test';
import type { AdminInvitation, SeatingTable, SeatingAssignment } from '../../supabase/functions/_shared/contracts';

const userId = '00000000-0000-4000-8000-000000000001';
async function setup(page: Page) {
  const now = new Date().toISOString();
  const state = { tables: [] as SeatingTable[], assignments: [] as SeatingAssignment[], nextTable: 1, rows: ['Ana López','Carlos Pérez','Diego Mora','María Solís','Eva Archivada'].map((full_name,index) => ({
    id: `00000000-0000-4000-8000-00000000000${index + 1}`, full_name, phone: '', expires_at: '2027-01-02T20:30:00Z', created_at: now, updated_at: now,
    sent_at: null, archived_at: index === 4 ? now : null, revoked: false, status: index === 0 ? 'accepted' : index === 3 ? 'declined' : 'pending', notes: '', responded_at: index === 0 || index === 3 ? now : null,
  })) as AdminInvitation[] };
  const jwt = [Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:userId,exp:Math.floor(Date.now()/1000)+3600,aud:'authenticated'})).toString('base64url'),'signature'].join('.');
  await page.route('**/auth/v1/token?**',route => route.fulfill({json:{access_token:jwt,refresh_token:'test-refresh',token_type:'bearer',expires_in:3600,user:{id:userId,aud:'authenticated',email:'admin@example.test',app_metadata:{},user_metadata:{},created_at:now}}}));
  await page.route('**/functions/v1/wedding-api',async route => {
    expect(route.request().headers().authorization).toBe(`Bearer ${jwt}`);
    const input=route.request().postDataJSON();
    const fail=(error:string)=>route.fulfill({status:409,json:{error}});
    if(input.action==='list') {
      const active=state.rows.filter(row=>!row.archived_at);
      return route.fulfill({json:{invitations:state.rows,seating:{tables:state.tables,assignments:state.assignments},fetched_at:new Date().toISOString(),metrics:{total:active.length,accepted:1,pending:2,declined:1,sent:0,response_rate:50}}});
    }
    if(input.action==='seating_create') {
      if(state.tables.some(table=>table.name.toLowerCase()===input.name.toLowerCase()))return fail('TABLE_NAME_EXISTS');
      const table={id:`10000000-0000-4000-8000-${String(state.nextTable++).padStart(12,'0')}`,name:input.name,capacity:input.capacity,created_at:now,updated_at:now};
      state.tables.push(table);return route.fulfill({json:{id:table.id}});
    }
    if(input.action==='seating_edit') {
      const table=state.tables.find(table=>table.id===input.id)!;
      if(state.assignments.filter(assignment=>assignment.table_id===table.id).length>input.capacity)return fail('TABLE_CAPACITY_TOO_SMALL');
      Object.assign(table,{name:input.name,capacity:input.capacity});return route.fulfill({json:{id:table.id}});
    }
    if(input.action==='seating_delete') {
      state.tables=state.tables.filter(table=>table.id!==input.id);state.assignments=state.assignments.filter(assignment=>assignment.table_id!==input.id);
      return route.fulfill({json:{id:input.id}});
    }
    if(input.action==='seating_assign') {
      if(input.table_id) {
        if(state.rows.some(row=>input.invitation_ids.includes(row.id)&&(row.archived_at||row.status==='declined')))return fail('INVITATION_UNAVAILABLE');
        const table=state.tables.find(table=>table.id===input.table_id)!;
        if(state.assignments.filter(assignment=>assignment.table_id===table.id&&!input.invitation_ids.includes(assignment.invitation_id)).length+input.invitation_ids.length>table.capacity)return fail('TABLE_FULL');
      }
      state.assignments=state.assignments.filter(assignment=>!input.invitation_ids.includes(assignment.invitation_id));
      if(input.table_id)state.assignments.push(...input.invitation_ids.map((invitation_id:string)=>({invitation_id,table_id:input.table_id,assigned_at:now})));
      return route.fulfill({json:{ok:true}});
    }
    throw new Error(`Unexpected action ${input.action}`);
  });
  await page.goto('/admin/');await page.getByLabel('Correo').fill('admin@example.test');await page.getByLabel('Contraseña').fill('test-password');await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Respuestas de invitados'})).toBeVisible();
  return state;
}
async function navigate(page:Page,isMobile:boolean,name:string) {
  if(isMobile)await page.getByRole('button',{name:'Menú',exact:true}).click();
  await page.getByRole('navigation',{name:'Navegación de administración'}).getByRole('button',{name:name==='Invitados'?/^Invitados(?: \d+)?$/:name,exact:true}).click();
}
async function createTable(page:Page,name:string,capacity:number) {
  await page.getByRole('button',{name:'Nueva mesa',exact:true}).click();
  await page.getByLabel('Nombre de la mesa').fill(name);await page.getByLabel('Capacidad (personas)').fill(String(capacity));
  await page.getByRole('button',{name:'Guardar mesa',exact:true}).click();
  await expect(page.getByRole('region',{name:`Detalle de ${name}`,exact:true})).toBeVisible();
}

test('admin creates tables, assigns groups, moves people and sees updated confirmations',async({page,isMobile})=>{
  const state=await setup(page);await navigate(page,isMobile,'Mesas');
  await expect(page.getByText('Todavía no hay mesas',{exact:true})).toBeVisible();
  await createTable(page,'Mesa Familia',2);await createTable(page,'Mesa Amigos',1);
  await page.getByRole('button',{name:/^Mesa Familia,/}).click();
  let detail=page.getByRole('region',{name:'Detalle de Mesa Familia',exact:true});
  await detail.getByRole('button',{name:'Asignar invitados',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Asignar invitados a Mesa Familia',exact:true});
  await expect(dialog.getByRole('checkbox',{name:/María Solís/})).toHaveCount(0);
  await expect(dialog.getByRole('checkbox',{name:/Eva Archivada/})).toHaveCount(0);
  await dialog.getByRole('checkbox',{name:/Ana López/}).check();await dialog.getByRole('checkbox',{name:/Carlos Pérez/}).check();await dialog.getByRole('checkbox',{name:/Diego Mora/}).check();
  await expect(dialog.getByRole('button',{name:'Asignar 3 invitados',exact:true})).toBeDisabled();
  await dialog.getByRole('checkbox',{name:/Diego Mora/}).uncheck();await dialog.getByRole('button',{name:'Asignar 2 invitados',exact:true}).click();
  await expect(dialog).not.toBeVisible();await expect(detail).toContainText('2 de 2 plazas asignadas');
  await expect(page.getByRole('button',{name:'Mesa Familia, 2 de 2 plazas asignadas',exact:true})).toBeFocused();
  await expect(detail.getByRole('button',{name:'Asignar invitados',exact:true})).toBeDisabled();
  expect(state.assignments).toHaveLength(2);
  await page.locator('.admin-seating').screenshot({path:`.tools/seating-${test.info().project.name}.png`});
  await navigate(page,isMobile,'Invitados');
  await expect(page.getByRole('row').filter({has:page.getByRole('cell',{name:'Ana López',exact:true})})).toContainText('Mesa Familia');
  await navigate(page,isMobile,'Mesas');await page.getByRole('button',{name:/^Mesa Amigos,/}).click();
  detail=page.getByRole('region',{name:'Detalle de Mesa Amigos',exact:true});await detail.getByRole('button',{name:'Asignar invitados',exact:true}).click();
  dialog=page.getByRole('dialog',{name:'Asignar invitados a Mesa Amigos',exact:true});
  await expect(dialog.getByRole('checkbox',{name:/Carlos Pérez/})).toHaveCount(0);
  await dialog.getByLabel('Incluir invitados de otras mesas').check();await dialog.getByRole('checkbox',{name:/Carlos Pérez/}).check();
  await dialog.getByRole('button',{name:'Asignar 1 invitado',exact:true}).click();await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Mesa Familia, 1 de 2 plazas asignadas',exact:true})).toBeVisible();
  expect(state.assignments.filter(assignment=>assignment.invitation_id===state.rows[1].id)).toHaveLength(1);
  await detail.getByRole('button',{name:'Editar mesa',exact:true}).click();
  await page.getByLabel('Nombre de la mesa').fill('Mesa Amistades');await page.getByLabel('Capacidad (personas)').fill('2');await page.getByRole('button',{name:'Guardar mesa',exact:true}).click();
  detail=page.getByRole('region',{name:'Detalle de Mesa Amistades',exact:true});await expect(detail).toContainText('1 de 2 plazas asignadas');
  state.rows[1].status='declined';state.rows[1].responded_at=new Date().toISOString();
  await page.getByRole('button',{name:'Actualizar',exact:true}).click();await expect(detail.locator('.admin-seat-warning')).toBeVisible();
  await expect(detail.locator('.status-badge')).toHaveText('No asistirá');
  await detail.getByRole('button',{name:'Quitar de la mesa a Carlos Pérez',exact:true}).click();await expect(detail.getByText('Esta mesa aún está vacía',{exact:true})).toBeVisible();
  await detail.getByRole('button',{name:'Eliminar mesa',exact:true}).click();
  const deletion=page.getByRole('dialog',{name:'¿Eliminar la mesa Mesa Amistades?',exact:true});
  await deletion.getByRole('button',{name:'Cancelar',exact:true}).click();expect(state.tables).toHaveLength(2);
  await detail.getByRole('button',{name:'Eliminar mesa',exact:true}).click();await deletion.getByRole('button',{name:'Eliminar mesa',exact:true}).click();
  await expect(deletion).not.toBeVisible();expect(state.tables).toHaveLength(1);expect(state.rows).toHaveLength(5);expect(state.assignments).toHaveLength(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('server capacity conflict keeps the original seat and reports the error',async({page,isMobile})=>{
  const state=await setup(page);await navigate(page,isMobile,'Mesas');await createTable(page,'Mesa Única',1);
  const detail=page.getByRole('region',{name:'Detalle de Mesa Única',exact:true});await detail.getByRole('button',{name:'Asignar invitados',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Asignar invitados a Mesa Única',exact:true});await dialog.getByRole('checkbox',{name:/Ana López/}).check();
  state.assignments.push({invitation_id:state.rows[2].id,table_id:state.tables[0].id,assigned_at:new Date().toISOString()});
  await dialog.getByRole('button',{name:'Asignar 1 invitado',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('no tiene suficientes plazas');
  expect(state.assignments).toHaveLength(1);expect(state.assignments[0].invitation_id).toBe(state.rows[2].id);
  await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await page.getByRole('button',{name:'Actualizar',exact:true}).click();
  await expect(detail).toContainText('Diego Mora');await expect(detail.getByRole('button',{name:'Asignar invitados',exact:true})).toBeDisabled();
});
