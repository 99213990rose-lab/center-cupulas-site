'use strict';
const { chromium } = require('playwright');

const url = process.env.E2E_URL;
if (!url) throw new Error('E2E_URL missing');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:1366,height:768}});
  const consoleErrors=[];
  const diagnostics=[];
  page.on('pageerror',e=>consoleErrors.push(String(e.message||e)));
  page.on('response',res=>{
    if(res.url().includes('/api/pricing/preview')||res.url().includes('/api/checkout/preview')){
      diagnostics.push({endpoint:new URL(res.url()).pathname,status:res.status()});
    }
  });
  try {
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForSelector('[data-configurator-host] [data-configuration-form]',{timeout:25000});
    const form=page.locator('[data-configurator-host][data-mode="custom"] [data-configuration-form]');
    console.log('Step 1: Formato',await form.locator('[data-field="format"]:checked').inputValue());
    await form.locator('[data-step-next]').click();
    await form.locator('[data-field="material"][value="Juta"]').check();
    console.log('Step 2: Material Juta');
    await form.locator('[data-step-next]').click();
    await form.locator('[data-field="measure-mode"][value="custom"]').check();
    await form.locator('[data-field="upper"]').fill('20');
    await form.locator('[data-field="lower"]').fill('20');
    await form.locator('[data-field="height"]').fill('20');
    await form.locator('[data-field="quantity"][value="20"]').locator('xpath=..').click();
    console.log('Step 3: 20x20x20 cm - 20 unidades');
    await form.locator('[data-step-next]').click();
    await page.waitForFunction(()=>{
      const e=document.querySelector('[data-configurator-host][data-mode="custom"] [data-price-badge]');
      return e&&e.textContent&&!e.textContent.includes('Calculando');
    },null,{timeout:25000});
    const badge=await form.locator('[data-price-badge]').innerText();
    const priceText=await form.locator('[data-price-body]').innerText();
    const addLabel=await form.locator('[data-step-submit]').innerText();
    console.log('Step 4: Quote',JSON.stringify({badge,priceText,addLabel}));
    await form.locator('[data-step-submit]').click();
    await page.waitForURL(/\/carrinho\.html/,{timeout:20000});
    await page.waitForFunction(()=>{
      const el=document.querySelector('[data-cart-total]');
      return el&&!/Calculando/.test(el.textContent||'');
    },null,{timeout:25000});
    const cart=await page.evaluate(()=>{
      const text=(selector)=>document.querySelector(selector)?.textContent?.trim()||'';
      return {
        products:text('[data-cart-total]'),boxes:text('[data-cart-packaging-fee]'),
        grandTotal:text('[data-cart-grand-total]'),freight:text('[data-cart-freight]'),
        status:text('[data-checkout-status]'),items:document.querySelectorAll('[data-cart-id]').length,
        checkoutDisabled:document.querySelector('[data-checkout-submit]')?.disabled ?? null
      };
    });
    console.log('Cart:',JSON.stringify(cart));
    console.log('API Responses:',JSON.stringify(diagnostics));
    console.log('Page Errors:',JSON.stringify(consoleErrors.slice(0,6)));
    const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
    assert(cart.items===1,'FAILED: Item não chegou ao carrinho');
    assert(cart.products.includes('R
    assert(cart.boxes.includes('R
    assert(cart.checkoutDisabled===true,'FAILED: checkout deveria permanecer bloqueado em testes');
    assert(diagnostics.some(x=>x.endpoint==='/api/checkout/preview' && x.status===200),'FAILED: endpoint do carrinho falhou');
    assert(consoleErrors.length===0,'FAILED: Erro JavaScript no navegador');
    console.log('E2E PASSED: configurador -> carrinho -> preços produtos+caixas -> pagamento bloqueado.');
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error('E2E FAILED:',e.stack||e);process.exitCode=1;});
) && !/^R\\$\\s*0,00$/.test(cart.products),'FAILED: Preço das cúpulas não carregou');
    assert(cart.boxes.includes('R$') && !cart.boxes.includes('0,00'),'FAILED: Custo das caixas não carregou');
    assert(cart.checkoutDisabled===true,'FAILED: checkout deveria permanecer bloqueado em testes');
    assert(diagnostics.some(x=>x.endpoint==='/api/checkout/preview' && x.status===200),'FAILED: endpoint do carrinho falhou');
    assert(consoleErrors.length===0,'FAILED: Erro JavaScript no navegador');
    console.log('E2E PASSED: configurador -> carrinho -> preços produtos+caixas -> pagamento bloqueado.');
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error('E2E FAILED:',e.stack||e);process.exitCode=1;});
) && !/^R\\$\\s*0,00$/.test(cart.boxes),'FAILED: Custo das caixas não carregou');
    assert(cart.checkoutDisabled===true,'FAILED: checkout deveria permanecer bloqueado em testes');
    assert(diagnostics.some(x=>x.endpoint==='/api/checkout/preview' && x.status===200),'FAILED: endpoint do carrinho falhou');
    assert(consoleErrors.length===0,'FAILED: Erro JavaScript no navegador');
    console.log('E2E PASSED: configurador -> carrinho -> preços produtos+caixas -> pagamento bloqueado.');
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error('E2E FAILED:',e.stack||e);process.exitCode=1;});
) && !/^R\\$\\s*0,00$/.test(cart.products),'FAILED: Preço das cúpulas não carregou');
    assert(cart.boxes.includes('R$') && !cart.boxes.includes('0,00'),'FAILED: Custo das caixas não carregou');
    assert(cart.checkoutDisabled===true,'FAILED: checkout deveria permanecer bloqueado em testes');
    assert(diagnostics.some(x=>x.endpoint==='/api/checkout/preview' && x.status===200),'FAILED: endpoint do carrinho falhou');
    assert(consoleErrors.length===0,'FAILED: Erro JavaScript no navegador');
    console.log('E2E PASSED: configurador -> carrinho -> preços produtos+caixas -> pagamento bloqueado.');
  } finally {
    await browser.close();
  }
})().catch(e=>{console.error('E2E FAILED:',e.stack||e);process.exitCode=1;});
