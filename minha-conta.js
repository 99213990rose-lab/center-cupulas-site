(() => {
  'use strict';
  const ROOT='https://nygjkojgvbdhemvfsqug.supabase.co';
  const PUBLIC_KEY="sb_publishable_JUerwqtWX-b7s8vF-O3KJw_e9Vo56HO";
  const authPanel=document.querySelector('[data-account-auth]');
  const ordersPanel=document.querySelector('[data-account-orders]');
  const form=document.querySelector('#account-form');
  const authFeedback=document.querySelector('[data-auth-feedback]');
  const ordersFeedback=document.querySelector('[data-orders-feedback]');
  const orderHost=document.querySelector('[data-orders-list]');
  const emailLabel=document.querySelector('[data-account-email]');
  const submit=document.querySelector('[data-auth-submit]');
  if(!form||!window.supabase?.createClient){
    if(authFeedback)authFeedback.textContent='Não foi possível carregar o acesso agora. Atualize a página e tente novamente.';
    return;
  }
  const sb=window.supabase.createClient(ROOT,PUBLIC_KEY,{
    auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true,
      storageKey:'center-cupulas-customer-auth'}
  });
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
  const brl=x=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(x)||0);
  const date=x=>{const d=new Date(x);return Number.isNaN(d.getTime())?'':d.toLocaleDateString('pt-BR');};
  const say=(box,message,kind='info')=>{if(box){box.textContent=message;box.dataset.kind=kind;}};
  let mode='login';
  let lastOrdersRequest=0;
  const terms={queued:'Aguardando produção',in_production:'Em produção',processing:'Em produção',
    finished:'Produção concluída',ready:'Pronto para retirada ou envio',
    shipped:'Enviado',delivered:'Entregue',confirmed:'Pedido confirmado'};
  const showAuth=()=>{authPanel.hidden=false;ordersPanel.hidden=true;};
  const showAccount=email=>{
    authPanel.hidden=true;ordersPanel.hidden=false;emailLabel.textContent=email||'';
  };
  const setMode=next=>{
    mode=next;
    form.querySelector('[name=password]').autocomplete=next==='signup'||next==='recovery'?'new-password':'current-password';
    form.elements.email.closest('label').hidden=next==='recovery';
    form.elements.email.required=next!=='recovery';
    document.querySelectorAll('[data-auth-mode]').forEach(btn=>{
      btn.setAttribute('aria-pressed',String(btn.dataset.authMode===next));
    });
    submit.textContent=next==='signup'?'Criar conta':next==='recovery'?'Atualizar senha':'Entrar na minha conta';
    say(authFeedback,'');
  };
  document.querySelectorAll('[data-auth-mode]').forEach(btn=>{
    btn.addEventListener('click',()=>setMode(btn.dataset.authMode));
  });
  const formatAddress=address=>address?
    [address.street,address.number,address.neighborhood,
     [address.city,address.state].filter(Boolean).join('/'),address.cep]
      .filter(Boolean).map(esc).join(', '):'';
  const renderOrder=o=>{
    const ship=o.shipping||{};
    const status=terms[o.production_status]||terms[o.status]||'Aguardando atualização';
    const pickup=ship.fulfillment==='pickup';
    const destination=pickup ? 'Rua Cachoeira Buriti, 44, Itaquera, São Paulo/SP' : formatAddress(ship.address);
    const items=(o.items||[]).map(item=>{
      const dims=item.dimensions?[item.dimensions.top,item.dimensions.bottom,item.dimensions.height].join(' × ')+' cm':'';
      return '<li><strong>'+esc(item.description)+'</strong> — '+esc(item.quantity)+' un. '+
       (dims?'('+esc(dims)+') ':'')+
       [item.material,item.color].filter(Boolean).map(esc).join(' / ')+
       ' · '+brl(item.line_total)+'</li>';
    }).join('');
    return '<article class="account-order"><div class="account-order__head">'+
      '<div><h3>'+esc(o.code||'Pedido')+'</h3><small>Realizado em '+esc(date(o.date))+'</small></div>'+
      '<strong>'+brl(o.total)+'</strong></div><div class="account-order__body">'+
      '<div><span class="account-pill">Pagamento confirmado</span></div>'+
      '<p><strong>Produção:</strong> '+esc(status)+'</p>'+
      (items?'<div><strong>Produtos:</strong><ul class="account-order__items">'+items+'</ul></div>':'')+
      '<div class="account-order__address"><strong>'+(pickup?'Retirada no local':'Entrega')+':</strong> '+
        (destination||'Endereço conforme o pedido')+'</div>'+
      (pickup?'<p>Agende o horário após a confirmação de que o pedido está pronto.</p>':
        '<p>Frete registrado: '+brl(ship.freight)+
        (ship.tracking_code?' · Rastreamento: '+esc(ship.tracking_code):'')+'</p>')+
      '</div></article>';
  };
  async function loadOrders(){
    const seq=++lastOrdersRequest;
    say(ordersFeedback,'Carregando seus pedidos...');
    const {data:{session},error}=await sb.auth.getSession();
    if(error||!session?.access_token){showAuth();say(authFeedback,'Entre na sua conta novamente.');return;}
    try {
      const res=await fetch('/api/account/orders',{method:'GET',headers:{
        Authorization:'Bearer '+session.access_token
      },cache:'no-store'});
      const payload=await res.json();
      if(seq!==lastOrdersRequest)return;
      if(res.status===401){showAuth();say(authFeedback,'Sua sessão expirou. Entre novamente.','error');return;}
      if(res.status===403){
        say(ordersFeedback,'Confirme seu e-mail para liberar o histórico de pedidos. Confira sua caixa de entrada.','error');
        orderHost.replaceChildren();return;
      }
      if(!res.ok||!Array.isArray(payload.orders))throw Error('unavailable');
      say(ordersFeedback,payload.orders.length?payload.orders.length+' pedido(s) encontrado(s).':'');
      orderHost.innerHTML=payload.orders.length
        ? payload.orders.map(renderOrder).join('')
        : '<div class="account-empty"><strong>Nenhum pedido pago vinculado a este e-mail.</strong>'+
          'Você pode comprar como visitante. Para aparecer aqui, informe este mesmo e-mail no checkout. '+
          'Pedidos históricos sem identificação de e-mail podem exigir conferência pela equipe.</div>';
    }catch{
      if(seq===lastOrdersRequest)say(ordersFeedback,'Não foi possível consultar seus pedidos agora. Tente novamente.','error');
    }
  }
  const refreshAccount=async()=>{
    const {data:{session}}=await sb.auth.getSession();
    if(!session){showAuth();return;}
    const {data:{user},error}=await sb.auth.getUser();
    if(error||!user){showAuth();return;}
    showAccount(user.email);
    if(!user.email_confirmed_at){
      say(ordersFeedback,'Confirme seu e-mail antes de acessar seus pedidos.','error');
      orderHost.replaceChildren();
      return;
    }
    await loadOrders();
  };
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!form.reportValidity())return;
    const email=form.elements.email.value.trim().toLowerCase();
    const password=form.elements.password.value;
    submit.disabled=true;say(authFeedback,'Aguarde...');
    try{
      if(mode==='recovery'){
        const {error}=await sb.auth.updateUser({password});
        if(error)throw error;
        form.elements.password.value='';
        await sb.auth.signOut();
        showAuth();setMode('login');
        say(authFeedback,'Senha atualizada. Entre com a nova senha.','success');
        return;
      }
      if(mode==='signup'){
        const {data,error}=await sb.auth.signUp({
          email,password,options:{emailRedirectTo:'https://www.centercupulas.com.br/meus-pedidos.html'}
        });
        if(error)throw error;
        form.elements.password.value='';
        if(!data.session){
          say(authFeedback,'Verifique seu e-mail e confirme seu cadastro para entrar.','success');return;
        }
        await refreshAccount();
      }else{
        const {error}=await sb.auth.signInWithPassword({email,password});
        if(error)throw error;
        form.elements.password.value='';
        await refreshAccount();
      }
    }catch(e){
      const generic='Não foi possível acessar. Confira e-mail e senha ou tente novamente.';
      say(authFeedback,e?.message?.includes('Email not confirmed')?'Confirme o e-mail antes de entrar.':generic,'error');
    }finally{submit.disabled=false;}
  });
  document.querySelector('[data-auth-recover]')?.addEventListener('click',async()=>{
    const email=form.elements.email.value.trim();
    if(!email){say(authFeedback,'Digite seu e-mail para recuperar a senha.');return;}
    try{await sb.auth.resetPasswordForEmail(email,{redirectTo:'https://www.centercupulas.com.br/meus-pedidos.html'});
      say(authFeedback,'Se houver uma conta cadastrada, enviaremos instruções de recuperação por e-mail.','success');
    }catch{say(authFeedback,'Não foi possível iniciar a recuperação agora.','error');}
  });
  document.querySelector('[data-account-signout]')?.addEventListener('click',async()=>{
    await sb.auth.signOut();++lastOrdersRequest;orderHost.replaceChildren();showAuth();say(authFeedback,'Você saiu da conta.');
  });
  document.querySelector('[data-orders-refresh]')?.addEventListener('click',()=>void loadOrders());
  sb.auth.onAuthStateChange((event)=>{
    if(event==='SIGNED_OUT'){++lastOrdersRequest;orderHost.replaceChildren();showAuth();}
    if(event==='PASSWORD_RECOVERY')setTimeout(()=>{
      showAuth();setMode('recovery');
      say(authFeedback,'Digite uma nova senha com pelo menos 8 caracteres.','info');
    },0);
  });
  void refreshAccount();
})();