-- IAD CRM — segmentos da Bio Water Care - Vale do Paraíba
-- ------------------------------------------------------------------
-- Rode DEPOIS de nuvem/correcao-10-segmentos.sql, que cria as colunas.
--
-- São 18 segmentos com subsegmentos, oportunidades e personas. Todos entram
-- ligados à empresa pelo nome — se ela não existir com esse nome exato, nada
-- é gravado e o aviso do fim explica. É de propósito: um insert que erra a
-- empresa espalha o catálogo de uma na carteira da outra, e isso não tem
-- desfazer simples.
--
-- Pode rodar de novo à vontade. O id é fixo por segmento, então repetir
-- atualiza em vez de duplicar — inclusive se você quiser corrigir um texto
-- aqui e reaplicar.

insert into public.segmentos (id, tenant_id, nome, subsegmentos, oportunidades, personas, ativo)
select v.id, t.id, v.nome, v.subsegmentos, v.oportunidades, v.personas, true
  from public.tenants t
  cross join (values
  ('seg-bwc-01', 'Saneamento', 'Concessionárias privadas; companhias estaduais; autarquias; SAAEs; prefeituras; PPPs; operadores regionais; loteamentos', 'ETA; ETE; poços; reservatórios; redes; cloro; turbidez; vazão; pressão; dosagem química; perdas; telemetria; qualidade; automação', 'Diretor de Operações; Gerente de Operações; Gerente de ETA/ETE; Gerente de Engenharia; Gerente de Automação; Gerente de Qualidade; Gerente de Meio Ambiente; Diretor Técnico'),
  ('seg-bwc-02', 'Alimentos', 'Frigoríficos; abatedouros; laticínios; massas; biscoitos; panificação; chocolates; óleos; cereais; congelados; ingredientes', 'Água de processo; potabilidade; CIP; ETA; ETE; reúso; redução de consumo; efluentes orgânicos; controle de dosagem', 'Diretor Industrial; Gerente Industrial; Gerente de Utilidades; Gerente de Engenharia; Gerente de Meio Ambiente; Gerente de Qualidade; Coordenador de ETA/ETE; Gerente de Manutenção'),
  ('seg-bwc-03', 'Bebidas', 'Cervejarias; refrigerantes; águas minerais; sucos; energéticos; destilados; vinícolas; café; chá', 'Água ingrediente; tratamento; CIP; torres; caldeiras; ETA; ETE; reúso; redução do consumo por litro produzido', 'Diretor Industrial; Gerente de Planta; Gerente de Utilidades; Gerente de Qualidade; Gerente de Engenharia; Gerente de Sustentabilidade; Gerente de Meio Ambiente'),
  ('seg-bwc-04', 'Agronegócio', 'Agricultura irrigada; grãos; cana; café; frutas; hortaliças; algodão; sementes; cooperativas', 'Poços; reservatórios; irrigação; disponibilidade hídrica; vazão; nível; perdas; nitrato; nitrito; qualidade; gestão integrada das fontes', 'Diretor de Operações; Gerente Agrícola; Gerente de Irrigação; Gerente de Fazenda; Gerente de Sustentabilidade; Coordenador Ambiental'),
  ('seg-bwc-05', 'Proteína Animal', 'Bovinos; suínos; aves; granjas; confinamentos; produção leiteira; piscicultura; aquicultura', 'Água para animais; biossegurança; qualidade; reúso; poços; efluentes; fertirrigação; monitoramento contínuo', 'Diretor de Produção; Gerente de Produção; Gerente de Fazenda; Gerente de Qualidade; Veterinário responsável; Gerente Ambiental; Gerente de Engenharia'),
  ('seg-bwc-06', 'Açúcar, Etanol e Bioenergia', 'Usinas de açúcar; etanol; biodiesel; biogás; biomassa', 'Captação; água industrial; caldeiras; torres; processo; vinhaça; ETE; reúso; balanço hídrico; eficiência hídrica', 'Diretor Industrial; Gerente Industrial; Gerente de Utilidades; Gerente de Engenharia; Gerente Ambiental; Gerente de Sustentabilidade; Coordenador de ETA/ETE'),
  ('seg-bwc-07', 'Química e Petroquímica', 'Química básica; especialidades; resinas; polímeros; cloro-soda; tintas; solventes; adesivos', 'Água de processo; ETA; ETE; controle químico; dosagem; parâmetros críticos; reúso; efluentes complexos; conformidade', 'Diretor Industrial; Gerente de Operações; Gerente de Processos; Gerente de Utilidades; Gerente Ambiental; Gerente de Engenharia; Gerente de EHS'),
  ('seg-bwc-08', 'Fertilizantes e Agroquímicos', 'Fertilizantes; defensivos; adjuvantes; nutrientes; fertilizantes líquidos; misturadoras', 'Água industrial; ETE; pH; condutividade; dosagem; efluentes; reúso; telemetria; compliance ambiental', 'Diretor Industrial; Gerente de Produção; Gerente Ambiental; Gerente de Engenharia; Gerente de Utilidades; Gerente de EHS'),
  ('seg-bwc-09', 'Farmacêutica e Cosméticos', 'Medicamentos; veterinária; biotecnologia; cosméticos; higiene pessoal; saneantes; suplementos', 'Qualidade da água; monitoramento contínuo; rastreabilidade; auditorias; tratamento; ETE; alarmes; histórico digital', 'Diretor Industrial; Gerente de Qualidade; Gerente de Engenharia; Gerente de Utilidades; Gerente de Validação; Gerente de Meio Ambiente; Gerente de Compliance'),
  ('seg-bwc-10', 'Celulose, Papel e Florestal', 'Celulose; papel; embalagens; tissue; madeira processada; painéis', 'Grandes captações; ETA; água de processo; ETE; reúso; redução de intensidade hídrica; controle químico; balanço hídrico', 'Diretor Industrial; Gerente de Planta; Gerente de Utilidades; Gerente de Meio Ambiente; Gerente de Engenharia; Gerente de Processos; Gerente de Sustentabilidade'),
  ('seg-bwc-11', 'Mineração', 'Ferro; ouro; cobre; níquel; manganês; bauxita; fosfato; calcário; agregados', 'Captação; barragens; água de processo; drenagem; qualidade; efluentes; reúso; telemetria; monitoramento ambiental', 'Diretor de Operações; Gerente de Operações; Gerente de Meio Ambiente; Gerente de Barragens; Gerente de Engenharia; Gerente de Processos; Gerente de Sustentabilidade'),
  ('seg-bwc-12', 'Siderurgia e Metalurgia', 'Siderúrgicas; fundições; alumínio; cobre; galvanoplastia; tratamento superficial', 'Água industrial; torres; resfriamento; ETA; ETE; efluentes metálicos; reúso; controle químico', 'Diretor Industrial; Gerente de Utilidades; Gerente de Engenharia; Gerente de Processos; Gerente Ambiental; Gerente de Manutenção; Gerente de Operações'),
  ('seg-bwc-13', 'Óleo, Gás e Energia', 'Refinarias; terminais; bases; petróleo; gás; termelétricas; biomassa; hidrelétricas', 'Água industrial; torres; caldeiras; ETA; ETE; óleo/água; reúso; monitoramento ambiental; controle remoto', 'Diretor Industrial; Gerente de Operações; Gerente de Utilidades; Gerente de Engenharia; Gerente Ambiental; Gerente de Processos; Gerente de Integridade'),
  ('seg-bwc-14', 'Automotivo e Mobilidade', 'Montadoras; autopeças; pneus; aeronáutica; ferroviário; naval', 'Pintura; lavagem; água industrial; torres; ETA; ETE; reúso; redução de consumo; efluentes', 'Diretor Industrial; Gerente de Planta; Gerente de Utilidades; Gerente de Engenharia; Gerente Ambiental; Gerente de Manutenção; Gerente de Facilities'),
  ('seg-bwc-15', 'Varejo e Grandes Redes', 'Supermercados; atacarejos; centros de distribuição; hipermercados; redes alimentares', 'Consumo 24x7; vazamentos; Fator K; reservatórios; qualidade da água; telemetria; gestão multisite; dashboards', 'Diretor de Operações; Diretor de Engenharia; Gerente de Facilities; Gerente de Manutenção; Gerente de Operações; Controller; Gerente de Sustentabilidade'),
  ('seg-bwc-16', 'Real Estate e Facilities', 'Shoppings; condomínios; loteamentos; hotéis; resorts; clubes; parques; edifícios corporativos', 'Consumo; vazamentos; poços; reservatórios; qualidade; reúso; ETE; telemetria; gestão multisite', 'Diretor de Operações; Superintendente; Gerente de Facilities; Gerente de Operações; Gerente de Engenharia; Gerente de Manutenção; Síndico profissional; Asset Manager'),
  ('seg-bwc-17', 'Saúde e Educação', 'Hospitais; clínicas; laboratórios; universidades; escolas; centros de pesquisa', 'Água potável; reservatórios; qualidade sanitária; tratamento; rastreabilidade; consumo; efluentes; auditorias', 'Diretor Administrativo; Gerente de Facilities; Gerente de Engenharia Clínica; Gerente de Infraestrutura; Gerente de Qualidade; Gerente de Meio Ambiente; Gerente de Manutenção'),
  ('seg-bwc-18', 'Infraestrutura e Logística', 'Aeroportos; portos; terminais; centros logísticos; rodoviárias; ferrovias; armazéns', 'Consumo de água; reservatórios; poços; torres; ETE; reúso; telemetria; vazamentos; gestão remota', 'Diretor de Operações; Gerente de Facilities; Gerente de Infraestrutura; Gerente de Engenharia; Gerente de Manutenção; Gerente de Sustentabilidade')
  ) as v(id, nome, subsegmentos, oportunidades, personas)
 where t.nome = 'Bio Water Care - Vale do Paraíba'
on conflict (id) do update
   set nome          = excluded.nome,
       subsegmentos  = excluded.subsegmentos,
       oportunidades = excluded.oportunidades,
       personas      = excluded.personas,
       tenant_id     = excluded.tenant_id,
       atualizado_em = now();

-- Conferência: tem de dizer 18.
select case
         when count(*) = 18 then 'OK — ' || count(*) || ' segmentos na ' || 'Bio Water Care - Vale do Paraíba'
         when count(*) = 0  then 'NADA GRAVADO — confira se a empresa existe com o nome exato ' || 'Bio Water Care - Vale do Paraíba'
         else 'PARCIAL — ' || count(*) || ' de 18'
       end as resultado
  from public.segmentos s
  join public.tenants t on t.id = s.tenant_id
 where t.nome = 'Bio Water Care - Vale do Paraíba' and s.id like 'seg-bwc-%';

-- Para ver o que entrou:
select s.nome, s.subsegmentos, s.oportunidades, s.personas
  from public.segmentos s
  join public.tenants t on t.id = s.tenant_id
 where t.nome = 'Bio Water Care - Vale do Paraíba'
 order by s.nome;
