/* =====================================================
   CARRINHO
===================================================== */

let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];


/* =====================================================
   SUPABASE - IMAGENS DE INSPIRAÇÃO
===================================================== */

const SUPABASE_URL = "https://tjhqqopgjzvnqvxcqxyn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gXufC47imd13mJFFAvilmg_KSo3zld-";
const SUPABASE_BUCKET_INSPIRACOES = "inspiracoes";


/* =====================================================
   DATAS BLOQUEADAS PARA NOVAS ENCOMENDAS
===================================================== */

let datasBloqueadasEncomenda = new Set();

const IDS_CAMPOS_DATA_ENCOMENDA = [
    "dataRetirada",
    "dataRetiradaDocinhos",
    "dataRetiradaCupcakes",
    "dataRetiradaCaseirinho",
    "dataRetiradaKitFesta"
];

function hojeISOSite() {
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, "0");
    const dia = String(agora.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
}

function formatarDataSite(dataISO) {
    if (!dataISO) return "";
    const [ano, mes, dia] = String(dataISO).split("-");
    return `${dia}/${mes}/${ano}`;
}

function aplicarLimiteMinimoDatasEncomenda() {
    const hoje = hojeISOSite();

    IDS_CAMPOS_DATA_ENCOMENDA.forEach(id => {
        const campo = document.getElementById(id);
        if (campo) {
            campo.min = hoje;
        }
    });
}

function dataEncomendaEstaBloqueada(dataISO) {
    return Boolean(dataISO && datasBloqueadasEncomenda.has(dataISO));
}

function obterMensagemDataCampo(campo) {
    if (!campo) return null;

    const wrapper =
        campo.closest(".campo-data-retirada-wrapper") ||
        campo.parentElement;

    if (!wrapper) return null;

    let mensagem =
        wrapper.querySelector(".mensagem-data-indisponivel");

    if (!mensagem) {
        mensagem = document.createElement("div");
        mensagem.className = "mensagem-data-indisponivel";
        mensagem.hidden = true;
        wrapper.appendChild(mensagem);
    }

    return mensagem;
}

function mostrarMensagemDataCampo(campo, texto, tipo = "erro") {
    const mensagem =
        obterMensagemDataCampo(campo);

    if (!mensagem) return;

    mensagem.className =
        `mensagem-data-indisponivel ${tipo === "ok" ? "ok" : "erro"}`;

    mensagem.innerHTML =
        tipo === "ok"
            ? `✓ ${texto}`
            : `⚠ ${texto}`;

    mensagem.hidden = false;
}

function limparMensagemDataCampo(campo) {
    const mensagem =
        obterMensagemDataCampo(campo);

    if (!mensagem) return;

    mensagem.hidden = true;
    mensagem.textContent = "";
}

function validarDataRetiradaDisponivel(campo, mostrarAviso = true) {
    if (!campo) {
        return true;
    }

    const valor =
        String(campo.value || "");

    if (!valor) {
        limparMensagemDataCampo(campo);
        return true;
    }

    // Só valida quando o navegador já tiver uma data completa.
    // Isso evita disparar erro enquanto a pessoa ainda está digitando
    // dia, mês e principalmente o ano.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        return true;
    }

    if (valor < hojeISOSite()) {
        if (mostrarAviso) {
            mostrarMensagemDataCampo(
                campo,
                "Escolha uma data de retirada a partir de hoje."
            );
        }

        // Não limpamos o campo automaticamente.
        // Assim o usuário consegue terminar/corrigir a digitação.
        return false;
    }

    if (dataEncomendaEstaBloqueada(valor)) {
        if (mostrarAviso) {
            mostrarMensagemDataCampo(
                campo,
                `A data ${formatarDataSite(valor)} não está disponível para novas encomendas. Escolha outra data.`
            );
        }

        // Mantém a data visível para o usuário entender qual foi bloqueada.
        return false;
    }

    mostrarMensagemDataCampo(
        campo,
        `${formatarDataSite(valor)} está disponível para retirada.`,
        "ok"
    );

    return true;
}

async function carregarDatasBloqueadasEncomenda() {
    try {
        const endpoint =
            `${SUPABASE_URL}/rest/v1/datas_bloqueadas_encomenda` +
            `?data=gte.${hojeISOSite()}` +
            `&select=data` +
            `&order=data.asc`;

        const resposta = await fetch(endpoint, {
            headers: {
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
            }
        });

        if (!resposta.ok) {
            throw new Error(await resposta.text());
        }

        const registros = await resposta.json();

        datasBloqueadasEncomenda = new Set(
            (registros || [])
                .map(item => item.data)
                .filter(Boolean)
        );
    } catch (erro) {
        console.error("Erro ao carregar datas indisponíveis:", erro);
        datasBloqueadasEncomenda = new Set();
    }
}

function configurarValidacaoDatasEncomenda() {
    aplicarLimiteMinimoDatasEncomenda();

    IDS_CAMPOS_DATA_ENCOMENDA.forEach(id => {
        const campo = document.getElementById(id);

        if (
            !campo ||
            campo.dataset.validacaoBloqueioAtiva === "true"
        ) {
            return;
        }

        campo.dataset.validacaoBloqueioAtiva = "true";

        // Enquanto a pessoa está digitando, apenas removemos mensagens antigas.
        // Não validamos aqui para não interromper o preenchimento do ano.
        campo.addEventListener("input", function() {
            limparMensagemDataCampo(campo);
        });

        // A validação acontece quando a pessoa termina de preencher o campo.
        campo.addEventListener("blur", function() {
            validarDataRetiradaDisponivel(campo, true);
        });
    });
}

document.addEventListener("DOMContentLoaded", async function() {
    configurarValidacaoDatasEncomenda();

    await Promise.all([
        carregarDatasBloqueadasEncomenda(),
        carregarHorariosRetiradaSite()
    ]);

    configurarValidacaoCapacidadeDatas();
});






/* =====================================================
   LIMITE DE PEDIDOS POR DIA DA SEMANA
   Configurado uma única vez no painel administrativo.
===================================================== */

const cacheCapacidadeDatas = new Map();

function datasRetiradaDoCarrinho() {
    return [
        ...new Set(
            carrinho
                .map(item => String(item?.data || "").trim())
                .filter(data => /^\d{4}-\d{2}-\d{2}$/.test(data))
        )
    ];
}

async function consultarCapacidadeDataEncomenda(dataISO, usarCache = false) {
    if (!dataISO) return null;

    if (usarCache && cacheCapacidadeDatas.has(dataISO)) {
        return cacheCapacidadeDatas.get(dataISO);
    }

    const endpoint =
        `${SUPABASE_URL}/rest/v1/rpc/capacidade_data_encomenda`;

    const resposta = await fetch(endpoint, {
        method: "POST",
        headers: {
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            p_data: dataISO
        })
    });

    if (!resposta.ok) {
        throw new Error(await resposta.text());
    }

    const dados = await resposta.json();

    const capacidade =
        Array.isArray(dados)
            ? dados[0]
            : dados;

    if (capacidade) {
        cacheCapacidadeDatas.set(dataISO, capacidade);
    }

    return capacidade || null;
}

async function validarCapacidadeDataCampo(campo, mostrarAviso = true) {
    if (!campo) return true;

    const dataISO = String(campo.value || "");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataISO)) {
        return true;
    }

    if (!validarDataRetiradaDisponivel(campo, mostrarAviso)) {
        return false;
    }

    try {
        const capacidade =
            await consultarCapacidadeDataEncomenda(dataISO, false);

        if (!capacidade) {
            return true;
        }

        const disponivel =
            Boolean(capacidade.disponivel);

        const limite =
            Number(capacidade.limite || 0);

        const pedidos =
            Number(capacidade.pedidos || 0);

        const vagas =
            Math.max(0, Number(capacidade.vagas || 0));

        if (!disponivel) {
            if (mostrarAviso) {
                const texto =
                    limite === 0
                        ? `Não estamos recebendo novos pedidos para ${formatarDataSite(dataISO)}. Escolha outra data.`
                        : `A agenda de ${formatarDataSite(dataISO)} já atingiu o limite de ${limite} pedido${limite === 1 ? "" : "s"}. Escolha outra data.`;

                mostrarMensagemDataCampo(campo, texto);
            }

            return false;
        }

        if (mostrarAviso) {
            mostrarMensagemDataCampo(
                campo,
                `${formatarDataSite(dataISO)} está disponível para retirada.`,
                "ok"
            );
        }

        return true;

    } catch (erro) {
        console.error("Erro ao consultar capacidade da data:", erro);

        if (mostrarAviso) {
            mostrarMensagemDataCampo(
                campo,
                "Não foi possível conferir a disponibilidade dessa data agora. Tente novamente."
            );
        }

        return false;
    }
}

function configurarValidacaoCapacidadeDatas() {
    IDS_CAMPOS_DATA_ENCOMENDA.forEach(id => {
        const campo = document.getElementById(id);

        if (
            !campo ||
            campo.dataset.validacaoCapacidadeAtiva === "true"
        ) {
            return;
        }

        campo.dataset.validacaoCapacidadeAtiva = "true";

        campo.addEventListener("change", async function() {
            await validarCapacidadeDataCampo(campo, true);
        });

        campo.addEventListener("blur", async function() {
            if (!campo.value) return;
            await validarCapacidadeDataCampo(campo, true);
        });
    });
}

async function validarCapacidadeCarrinhoAntesDoPedido() {
    const datas = datasRetiradaDoCarrinho();

    for (const dataISO of datas) {
        const capacidade =
            await consultarCapacidadeDataEncomenda(dataISO, false);

        if (!capacidade) continue;

        if (!Boolean(capacidade.disponivel)) {
            const limite =
                Number(capacidade.limite || 0);

            if (limite === 0) {
                throw new Error(
                    `Não estamos recebendo novos pedidos para ${formatarDataSite(dataISO)}. Escolha outra data de retirada.`
                );
            }

            throw new Error(
                `A agenda de ${formatarDataSite(dataISO)} acabou de atingir o limite de ${limite} pedido${limite === 1 ? "" : "s"}. Volte ao carrinho e escolha outra data de retirada.`
            );
        }
    }

    return true;
}


/* =====================================================
   HORÁRIO DE RETIRADA — INTERVALO EDITÁVEL PELO PAINEL
   Ex.: 07:00 até 18:00
===================================================== */

const IDS_CAMPOS_HORARIO_ENCOMENDA = [
    "horaRetirada",
    "horaRetiradaDocinhos",
    "horaRetiradaCupcakes",
    "horaRetiradaCaseirinho",
    "horaRetiradaKitFesta"
];

let configuracaoHorarioRetirada = {
    inicio: "",
    fim: ""
};

function formatarHorarioSite(valor) {
    return String(valor || "").slice(0, 5);
}

/* =====================================================
   TEXTO DINÂMICO DO HORÁRIO DE RETIRADA
   Mostra no site o mesmo intervalo configurado no painel.
   Ex.: Escolha um horário entre 07:00 e 18:00 para retirada.
===================================================== */

function atualizarTextosHorarioRetiradaSite() {
    const inicio = configuracaoHorarioRetirada.inicio;
    const fim = configuracaoHorarioRetirada.fim;

    IDS_CAMPOS_HORARIO_ENCOMENDA.forEach(id => {
        const campo = document.getElementById(id);
        if (!campo) return;

        /*
         * No HTML atual, o texto de orientação fica logo abaixo
         * do input de horário, dentro do mesmo bloco/coluna.
         * Procuramos primeiro elementos já existentes para não
         * alterar a estrutura visual das páginas.
         */
        const wrapper = campo.parentElement;
        if (!wrapper) return;

        let texto =
            wrapper.querySelector(".texto-horario-retirada-dinamico") ||
            wrapper.querySelector(".campo-ajuda") ||
            wrapper.querySelector(".texto-ajuda") ||
            wrapper.querySelector("small");

        /*
         * Caso a página não possua um elemento específico,
         * aproveitamos um texto existente que mencione horário.
         */
        if (!texto) {
            const candidatos = [...wrapper.querySelectorAll("div, p, span")];

            texto = candidatos.find(elemento => {
                if (
                    elemento === campo ||
                    elemento.classList.contains("mensagem-horario-indisponivel")
                ) {
                    return false;
                }

                const conteudo =
                    String(elemento.textContent || "")
                        .trim()
                        .toLowerCase();

                return (
                    conteudo.includes("horário") ||
                    conteudo.includes("horario")
                );
            });
        }

        /*
         * Se ainda não existir texto de ajuda, criamos somente
         * esse pequeno aviso, sem remover nenhum elemento da página.
         */
        if (!texto) {
            texto = document.createElement("div");
            texto.className = "texto-horario-retirada-dinamico";

            Object.assign(texto.style, {
                marginTop: "8px",
                padding: "9px 11px",
                border: "1px solid #e2c36d",
                borderRadius: "10px",
                background: "#fff9e7",
                color: "#806b62",
                fontSize: "12px",
                lineHeight: "1.4"
            });

            wrapper.appendChild(texto);
        }

        texto.classList.add("texto-horario-retirada-dinamico");

        if (inicio && fim) {
            texto.textContent =
                `Escolha um horário entre ${inicio} e ${fim} para retirada.`;
        } else {
            texto.textContent =
                "Carregando horário disponível para retirada...";
        }
    });
}

function obterMensagemHorarioCampo(campo) {
    if (!campo) return null;

    const wrapper = campo.parentElement;
    if (!wrapper) return null;

    let mensagem = wrapper.querySelector(".mensagem-horario-indisponivel");

    if (!mensagem) {
        mensagem = document.createElement("div");
        mensagem.className = "mensagem-horario-indisponivel";
        mensagem.hidden = true;

        Object.assign(mensagem.style, {
            marginTop: "8px",
            padding: "9px 11px",
            borderRadius: "10px",
            fontSize: "12px",
            fontWeight: "700",
            lineHeight: "1.4"
        });

        wrapper.appendChild(mensagem);
    }

    return mensagem;
}

function mostrarMensagemHorarioCampo(campo, texto, tipo = "erro") {
    const mensagem = obterMensagemHorarioCampo(campo);
    if (!mensagem) return;

    const ehOk = tipo === "ok";

    mensagem.textContent = `${ehOk ? "✓" : "⚠"} ${texto}`;
    mensagem.hidden = false;

    mensagem.style.background = ehOk ? "#edf8f0" : "#fff0ee";
    mensagem.style.border = ehOk ? "1px solid #b9dfc2" : "1px solid #e0aaa4";
    mensagem.style.color = ehOk ? "#26733a" : "#a13b34";
}

function limparMensagemHorarioCampo(campo) {
    const mensagem = obterMensagemHorarioCampo(campo);
    if (!mensagem) return;

    mensagem.hidden = true;
    mensagem.textContent = "";
}

function horarioEstaDentroDoIntervalo(valor) {
    const inicio = configuracaoHorarioRetirada.inicio;
    const fim = configuracaoHorarioRetirada.fim;

    if (!valor || !inicio || !fim) {
        return false;
    }

    return valor >= inicio && valor <= fim;
}

function aplicarIntervaloHorarioRetiradaSite() {
    const inicio = configuracaoHorarioRetirada.inicio;
    const fim = configuracaoHorarioRetirada.fim;

    IDS_CAMPOS_HORARIO_ENCOMENDA.forEach(id => {
        const campo = document.getElementById(id);
        if (!campo) return;

        campo.min = inicio || "";
        campo.max = fim || "";
        campo.disabled = !inicio || !fim;

        if (
            campo.value &&
            inicio &&
            fim &&
            !horarioEstaDentroDoIntervalo(campo.value)
        ) {
            campo.value = "";
        }
    });

    atualizarTextosHorarioRetiradaSite();
}

function validarHorarioRetiradaCampo(
    campo,
    {
        mostrarAviso = true,
        limparSeInvalido = false,
        exigirPreenchimento = true
    } = {}
) {
    if (!campo) return true;

    const valor = String(campo.value || "").slice(0, 5);
    const inicio = configuracaoHorarioRetirada.inicio;
    const fim = configuracaoHorarioRetirada.fim;

    if (!inicio || !fim) {
        if (mostrarAviso) {
            mostrarMensagemHorarioCampo(
                campo,
                "Os horários de retirada ainda não estão disponíveis. Tente novamente em instantes."
            );
        }

        return false;
    }

    if (!valor) {
        limparMensagemHorarioCampo(campo);

        if (exigirPreenchimento && mostrarAviso) {
            mostrarMensagemHorarioCampo(
                campo,
                `Escolha um horário de retirada entre ${inicio} e ${fim}.`
            );
        }

        return !exigirPreenchimento;
    }

    if (!horarioEstaDentroDoIntervalo(valor)) {
        if (limparSeInvalido) {
            campo.value = "";
        }

        if (mostrarAviso) {
            mostrarMensagemHorarioCampo(
                campo,
                `Horário indisponível. Escolha um horário entre ${inicio} e ${fim}.`
            );
        }

        return false;
    }

    mostrarMensagemHorarioCampo(
        campo,
        `${valor} está dentro do horário disponível para retirada.`,
        "ok"
    );

    return true;
}

function configurarValidacaoHorariosRetirada() {
    IDS_CAMPOS_HORARIO_ENCOMENDA.forEach(id => {
        const campo = document.getElementById(id);

        if (
            !campo ||
            campo.dataset.validacaoHorarioAtiva === "true"
        ) {
            return;
        }

        campo.dataset.validacaoHorarioAtiva = "true";

        /*
         * "change" é disparado quando o usuário conclui a escolha
         * no seletor nativo de horário. Se estiver fora do intervalo,
         * o valor é removido imediatamente.
         */
        campo.addEventListener("change", function() {
            validarHorarioRetiradaCampo(campo, {
                mostrarAviso: true,
                limparSeInvalido: true,
                exigirPreenchimento: false
            });
        });

        /*
         * Alguns navegadores permitem digitar manualmente um horário.
         * Ao sair do campo, fazemos a mesma validação.
         */
        campo.addEventListener("blur", function() {
            if (!campo.value) return;

            validarHorarioRetiradaCampo(campo, {
                mostrarAviso: true,
                limparSeInvalido: true,
                exigirPreenchimento: false
            });
        });
    });
}

async function carregarHorariosRetiradaSite() {
    try {
        const endpoint =
            `${SUPABASE_URL}/rest/v1/configuracao_retirada` +
            `?id=eq.1` +
            `&select=hora_inicio,hora_fim`;

        const resposta = await fetch(endpoint, {
            headers: {
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
            }
        });

        if (!resposta.ok) {
            throw new Error(await resposta.text());
        }

        const dados = await resposta.json();

        const configuracao =
            Array.isArray(dados) && dados.length
                ? dados[0]
                : null;

        configuracaoHorarioRetirada = {
            inicio: formatarHorarioSite(configuracao?.hora_inicio),
            fim: formatarHorarioSite(configuracao?.hora_fim)
        };

        aplicarIntervaloHorarioRetiradaSite();
        configurarValidacaoHorariosRetirada();

    } catch (erro) {
        console.error(
            "Erro ao carregar horário de retirada:",
            erro
        );

        configuracaoHorarioRetirada = {
            inicio: "",
            fim: ""
        };

        aplicarIntervaloHorarioRetiradaSite();
        configurarValidacaoHorariosRetirada();
    }
}

function horarioRetiradaValido(campo) {
    const valido = validarHorarioRetiradaCampo(campo, {
        mostrarAviso: true,
        limparSeInvalido: true,
        exigirPreenchimento: true
    });

    if (!valido && campo) {
        campo.focus();
    }

    return valido;
}


const TIPOS_IMAGEM_PERMITIDOS = [
    "image/jpeg",
    "image/png",
    "image/webp"
];

const TAMANHO_MAXIMO_IMAGEM = 5 * 1024 * 1024; // 5 MB


function validarImagemInspiracao(arquivo) {

    if (!arquivo) {
        return;
    }

    if (!TIPOS_IMAGEM_PERMITIDOS.includes(arquivo.type)) {
        throw new Error(
            "Formato de imagem não permitido. Use JPG, PNG ou WebP."
        );
    }

    if (arquivo.size > TAMANHO_MAXIMO_IMAGEM) {
        throw new Error(
            "A imagem deve ter no máximo 5 MB."
        );
    }

}


function normalizarNomeArquivo(nome) {

    const partes = nome.split(".");
    const extensao = partes.length > 1
        ? partes.pop().toLowerCase()
        : "jpg";

    const nomeBase = partes.join(".")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();

    return {
        nomeBase: nomeBase || "imagem",
        extensao
    };

}


async function enviarImagemParaSupabase(arquivo, tipo) {

    if (!arquivo) {
        return null;
    }

    validarImagemInspiracao(arquivo);

    const { nomeBase, extensao } =
        normalizarNomeArquivo(arquivo.name);

    const identificador =
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const caminho =
        `${tipo}/${identificador}-${nomeBase}.${extensao}`;

    const urlUpload =
        `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET_INSPIRACOES}/${caminho}`;

    const resposta = await fetch(
        urlUpload,
        {
            method: "POST",
            headers: {
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Authorization":
                    `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
                "Content-Type":
                    arquivo.type,
                "x-upsert":
                    "false"
            },
            body: arquivo
        }
    );

    if (!resposta.ok) {

        let detalhes = "";

        try {
            const erro = await resposta.json();
            detalhes =
                erro.message ||
                erro.error ||
                JSON.stringify(erro);
        } catch {
            detalhes = await resposta.text();
        }

        throw new Error(
            "Não foi possível enviar a imagem para o Supabase." +
            (detalhes ? ` ${detalhes}` : "")
        );
    }

    return (
        `${SUPABASE_URL}/storage/v1/object/public/` +
        `${SUPABASE_BUCKET_INSPIRACOES}/${caminho}`
    );

}


/* =====================================================
   SALVAR CARRINHO
===================================================== */

function salvarCarrinho() {
    localStorage.setItem("carrinho", JSON.stringify(carrinho));
    atualizarContadorCarrinho();
}


/* =====================================================
   CONTADOR DO CARRINHO
===================================================== */

function atualizarContadorCarrinho() {

    const contador =
        document.getElementById("quantidadeCarrinho");

    if (!contador) {
        return;
    }

    const quantidadeTotal =
        carrinho.reduce(
            (total, item) =>
                total + (item.quantidade || 1),
            0
        );

    contador.textContent = quantidadeTotal;
}


/* =====================================================
   FORMATAR VALOR
===================================================== */

function formatarMoeda(valor) {

    return Number(valor).toLocaleString(
        "pt-BR",
        {
            style: "currency",
            currency: "BRL"
        }
    );

}


/* =====================================================
   PRODUTOS SIMPLES DA PÁGINA INICIAL
===================================================== */

function adicionarCarrinho(
    nome = "Produto",
    preco = 0,
    categoria = "Produto",
    quantidade = 1,
    produtoId = null,
    estoqueMax = null
) {

    const quantidadeAdicionar =
        Math.max(
            1,
            Number(quantidade || 1)
        );

    const estoqueDisponivel =
        estoqueMax === null ||
        estoqueMax === undefined
            ? null
            : Math.max(
                0,
                Number(estoqueMax || 0)
            );

    const itemExistente =
        carrinho.find(
            item =>
                item.tipo === "produto" &&
                (
                    produtoId !== null &&
                    produtoId !== undefined
                        ? Number(item.produtoId) === Number(produtoId)
                        : item.nome === nome
                )
        );

    const quantidadeAtual =
        Number(
            itemExistente?.quantidade || 0
        );

    if (
        estoqueDisponivel !== null &&
        quantidadeAtual + quantidadeAdicionar > estoqueDisponivel
    ) {

        const restante =
            Math.max(
                0,
                estoqueDisponivel - quantidadeAtual
            );

        if (restante === 0) {
            alert(
                "Você já adicionou ao carrinho toda a quantidade disponível deste produto."
            );
        } else {
            alert(
                `Só existem mais ${restante} unidade${restante === 1 ? "" : "s"} disponível${restante === 1 ? "" : "is"} deste produto.`
            );
        }

        return false;
    }


    if (itemExistente) {

        itemExistente.quantidade =
            quantidadeAtual +
            quantidadeAdicionar;

        if (estoqueDisponivel !== null) {
            itemExistente.estoqueMax =
                estoqueDisponivel;
        }

        if (
            produtoId !== null &&
            produtoId !== undefined
        ) {
            itemExistente.produtoId =
                Number(produtoId);
        }

    } else {

        carrinho.push({

            id: Date.now(),

            tipo: "produto",

            produtoId:
                produtoId !== null &&
                produtoId !== undefined
                    ? Number(produtoId)
                    : null,

            nome: nome,

            categoria: categoria,

            preco: Number(preco),

            quantidade:
                quantidadeAdicionar,

            estoqueMax:
                estoqueDisponivel

        });

    }


    salvarCarrinho();

    return true;
}




/* =====================================================
   PRONTA ENTREGA - SUPABASE
   Exibe qualquer produto ativo cadastrado no painel:
   fatias, bolo de pote, pavê, mousse, brownie etc.
===================================================== */

async function buscarProdutosProntaEntregaSupabase() {

    const endpoint =
        `${SUPABASE_URL}/rest/v1/produtos_pronta_entrega` +
        `?ativo=eq.true` +
        `&select=id,nome,categoria,descricao,preco,imagem_url,ordem,estoque` +
        `&order=ordem.asc,created_at.desc`;

    const resposta =
        await fetch(
            endpoint,
            {
                headers: {
                    "apikey": SUPABASE_PUBLISHABLE_KEY,
                    "Authorization":
                        `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
                }
            }
        );

    if (!resposta.ok) {

        let detalhes = "";

        try {

            const erro =
                await resposta.json();

            detalhes =
                erro.message ||
                erro.error ||
                "";

        } catch {

            detalhes =
                await resposta.text();

        }

        throw new Error(
            "Não foi possível carregar os produtos de pronta entrega." +
            (detalhes ? ` ${detalhes}` : "")
        );
    }

    return await resposta.json();
}


function alterarQuantidadeProdutoCard(
    id,
    delta,
    estoqueMax = null
) {

    const campo =
        document.getElementById(
            `quantidadeProduto_${id}`
        );

    if (!campo) {
        return;
    }

    const atual =
        Number(campo.textContent || 1);

    let novaQuantidade =
        Math.max(
            1,
            atual + Number(delta || 0)
        );

    if (
        estoqueMax !== null &&
        estoqueMax !== undefined
    ) {

        const limite =
            Math.max(
                0,
                Number(estoqueMax || 0)
            );

        novaQuantidade =
            Math.min(
                novaQuantidade,
                Math.max(1, limite)
            );
    }

    campo.textContent =
        novaQuantidade;
}


function obterQuantidadeProdutoCard(id) {

    const campo =
        document.getElementById(
            `quantidadeProduto_${id}`
        );

    return Math.max(
        1,
        Number(campo?.textContent || 1)
    );
}


function renderizarProdutosProntaEntrega(produtos) {

    const lista =
        document.getElementById(
            "listaProdutosProntaEntrega"
        );

    if (!lista) {
        return;
    }

    if (
        !Array.isArray(produtos) ||
        produtos.length === 0
    ) {

        lista.innerHTML = `
            <div class="fatias-vazio" style="
                grid-column: 1 / -1;
                width: 100%;
                padding: 34px 22px;
                border: 1px solid #dfc270;
                border-radius: 16px;
                background: #fff9e7;
                text-align: center;
            ">

                <div style="
                    font-size: 30px;
                    margin-bottom: 10px;
                ">
                    ✨
                </div>

                <h3 style="
                    margin: 0 0 7px;
                    color: #6d0c2e;
                ">
                    Nenhum produto disponível no momento
                </h3>

                <p style="
                    margin: 0;
                    color: #806b62;
                    line-height: 1.55;
                ">
                    Quando houver produtos disponíveis para pronta entrega,
                    eles aparecerão aqui automaticamente.
                </p>

            </div>
        `;

        return;
    }


    lista.innerHTML = "";


    produtos.forEach(function(produto) {

        const estoque =
            Math.max(
                0,
                Number(produto.estoque || 0)
            );

        const esgotado =
            estoque <= 0;

        const artigo =
            document.createElement(
                "article"
            );

        artigo.className =
            "produto";


        const imagem =
            produto.imagem_url
                ? `
                    <div class="produto-imagem produto-imagem-foto">
                        <img
                            src="${escaparHtmlSite(produto.imagem_url)}"
                            alt="${escaparHtmlSite(produto.nome)}"
                            loading="lazy"
                            style="
                                width: 100%;
                                height: 100%;
                                object-fit: cover;
                                display: block;
                            "
                        >
                    </div>
                `
                : `
                    <div class="produto-imagem">
                        ✨
                    </div>
                `;


        artigo.innerHTML = `

            ${imagem}

            <div class="produto-info">

                <span class="produto-categoria">
                    ${escaparHtmlSite(
                        produto.categoria ||
                        "Pronta entrega"
                    )}
                </span>

                <div
                    class="produto-estoque-site ${esgotado ? "produto-esgotado" : estoque <= 3 ? "produto-estoque-baixo" : ""}"
                    style="
                        margin-top: 10px;
                        display: inline-flex;
                        width: fit-content;
                        padding: 6px 10px;
                        border-radius: 999px;
                        border: 1px solid ${esgotado ? "#e0aaa4" : "#dec270"};
                        background: ${esgotado ? "#fff0ee" : estoque <= 3 ? "#fff1bd" : "#fff8df"};
                        color: ${esgotado ? "#a13b34" : "#6d0c2e"};
                        font-size: 10px;
                        font-weight: 800;
                    "
                >
                    ${
                        esgotado
                            ? "Esgotado"
                            : `${estoque} ${estoque === 1 ? "unidade disponível" : "unidades disponíveis"}`
                    }
                </div>

                <h3>
                    ${escaparHtmlSite(produto.nome)}
                </h3>

                <p>
                    ${
                        escaparHtmlSite(
                            produto.descricao ||
                            "Produto disponível para pronta entrega."
                        )
                    }
                </p>


                <div class="produto-quantidade-area">

                    <span>
                        Quantidade
                    </span>

                    <div class="produto-controle-quantidade">

                        <button
                            type="button"
                            data-acao-quantidade="menos"
                            aria-label="Diminuir quantidade"
                            ${esgotado ? "disabled" : ""}
                        >
                            −
                        </button>

                        <strong
                            id="quantidadeProduto_${produto.id}"
                        >
                            1
                        </strong>

                        <button
                            type="button"
                            data-acao-quantidade="mais"
                            aria-label="Aumentar quantidade"
                            ${esgotado ? "disabled" : ""}
                        >
                            +
                        </button>

                    </div>

                </div>


                <div class="produto-rodape produto-rodape-fatia">

                    <strong>
                        ${formatarMoeda(produto.preco)}
                    </strong>

                    <button
                        type="button"
                        data-acao="adicionar-produto"
                        ${esgotado ? "disabled" : ""}
                        style="${esgotado ? "opacity:.55; cursor:not-allowed;" : ""}"
                    >
                        ${esgotado ? "Esgotado" : "Adicionar ao carrinho"}
                    </button>

                </div>

            </div>
        `;


        const botaoMenos =
            artigo.querySelector(
                '[data-acao-quantidade="menos"]'
            );

        const botaoMais =
            artigo.querySelector(
                '[data-acao-quantidade="mais"]'
            );

        const botaoAdicionar =
            artigo.querySelector(
                '[data-acao="adicionar-produto"]'
            );


        botaoMenos?.addEventListener(
            "click",
            function() {

                alterarQuantidadeProdutoCard(
                    produto.id,
                    -1,
                    estoque
                );

            }
        );


        botaoMais?.addEventListener(
            "click",
            function() {

                alterarQuantidadeProdutoCard(
                    produto.id,
                    1,
                    estoque
                );

            }
        );


        botaoAdicionar?.addEventListener(
            "click",
            function() {

                const quantidade =
                    obterQuantidadeProdutoCard(
                        produto.id
                    );

                if (esgotado) {
                    alert("Este produto está esgotado.");
                    return;
                }

                const adicionado =
                    adicionarCarrinho(
                        produto.nome,
                        Number(produto.preco || 0),
                        produto.categoria || "Pronta entrega",
                        quantidade,
                        produto.id,
                        estoque
                    );

                if (!adicionado) {
                    return;
                }

                alert(
                    quantidade === 1
                        ? `${produto.nome} adicionado ao carrinho.`
                        : `${quantidade} unidades de ${produto.nome} adicionadas ao carrinho.`
                );

            }
        );


        lista.appendChild(
            artigo
        );

    });
}


async function carregarProdutosProntaEntrega() {

    const lista =
        document.getElementById(
            "listaProdutosProntaEntrega"
        );

    if (!lista) {
        return;
    }

    try {

        const produtos =
            await buscarProdutosProntaEntregaSupabase();

        renderizarProdutosProntaEntrega(
            produtos
        );

    } catch (erro) {

        console.error(
            "Erro ao carregar produtos de pronta entrega:",
            erro
        );

        lista.innerHTML = `
            <div style="
                grid-column: 1 / -1;
                padding: 28px 20px;
                border: 1px solid #dfc270;
                border-radius: 16px;
                background: #fff9e7;
                text-align: center;
                color: #6d0c2e;
            ">
                Não foi possível carregar os produtos disponíveis.
            </div>
        `;

    }
}


document.addEventListener(
    "DOMContentLoaded",
    function() {

        carregarProdutosProntaEntrega();

    }
);



/* =====================================================
   MONTE SEU BOLO - OPÇÕES VINDAS DO SUPABASE
===================================================== */

let opcoesBoloSupabase = [];

function escaparHtmlSite(valor) {
    return String(valor ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function buscarOpcoesBoloSupabase() {

    const endpoint =
        `${SUPABASE_URL}/rest/v1/opcoes_encomenda` +
        `?tipo_produto=eq.bolo&ativo=eq.true&select=*` +
        `&order=grupo.asc,ordem.asc,created_at.asc`;

    const resposta = await fetch(
        endpoint,
        {
            headers: {
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
            }
        }
    );

    if (!resposta.ok) {
        throw new Error("Não foi possível carregar as opções de encomenda.");
    }

    return await resposta.json();
}

function textoPrecoOpcao(opcao) {

    const preco = Number(opcao.preco || 0);

    if (opcao.grupo === "tamanho") {
        return formatarMoeda(preco);
    }

    if (preco === 0) {
        return "Incluído";
    }

    return `+ ${formatarMoeda(preco)}`;
}

function criarOpcaoBolo(opcao) {

    const ehRecheio = opcao.grupo === "recheio";
    const ehAdicional = opcao.grupo === "outro";

    const inputType =
        (ehRecheio || ehAdicional)
            ? "checkbox"
            : "radio";

    const inputName =
        ehAdicional
            ? "adicional"
            : opcao.grupo;

    const label = document.createElement("label");
    label.className = "opcao-card";

    label.innerHTML = `
        <input
            type="${inputType}"
            name="${inputName}"
            value="${escaparHtmlSite(opcao.nome)}"
            data-preco="${Number(opcao.preco || 0)}"
            data-id="${opcao.id}"
        >

        <span>
            <strong>${escaparHtmlSite(opcao.nome)}</strong>
            <small>${textoPrecoOpcao(opcao)}</small>
            ${
                opcao.descricao
                    ? `<em>${escaparHtmlSite(opcao.descricao)}</em>`
                    : ""
            }
        </span>
    `;

    return label;
}

function renderizarGrupoBolo(grupo, idContainer) {

    const container = document.getElementById(idContainer);

    if (!container) {
        return;
    }

    const itens = opcoesBoloSupabase.filter(
        item => item.grupo === grupo
    );

    if (itens.length === 0) {

        if (grupo === "outro") {
            const etapa = document.getElementById("etapaAdicionais");
            if (etapa) {
                etapa.hidden = true;
            }
            return;
        }

        container.innerHTML = `
            <div class="opcoes-indisponiveis">
                Nenhuma opção disponível no momento.
            </div>
        `;

        return;
    }

    if (grupo === "outro") {
        const etapa = document.getElementById("etapaAdicionais");
        if (etapa) {
            etapa.hidden = false;
        }
    }

    container.innerHTML = "";

    itens.forEach(opcao => {
        container.appendChild(
            criarOpcaoBolo(opcao)
        );
    });
}



function renumerarEtapasBolo() {

    const etapas =
        document.querySelectorAll(
            "#painelBolo .opcoes-bolo .etapa-bolo"
        );

    let numero = 1;

    etapas.forEach(etapa => {

        const estaOculta =
            etapa.hidden ||
            getComputedStyle(etapa).display === "none";

        if (estaOculta) {
            return;
        }

        const marcador =
            etapa.querySelector(
                ".numero-etapa"
            );

        if (marcador) {
            marcador.textContent =
                numero;
        }

        numero++;
    });
}

function renderizarOpcoesBoloSupabase() {

    renderizarGrupoBolo(
        "tamanho",
        "opcoesTamanho"
    );

    renderizarGrupoBolo(
        "massa",
        "opcoesMassa"
    );

    renderizarGrupoBolo(
        "recheio",
        "opcoesRecheio"
    );

    renderizarGrupoBolo(
        "outro",
        "opcoesAdicionais"
    );

    renumerarEtapasBolo();
}

function recheiosSelecionados() {
    return [
        ...document.querySelectorAll(
            'input[name="recheio"]:checked'
        )
    ];
}

function adicionaisSelecionados() {
    return [
        ...document.querySelectorAll(
            'input[name="adicional"]:checked'
        )
    ];
}

function atualizarContadorRecheios() {

    const selecionados =
        recheiosSelecionados();

    const contador =
        document.getElementById(
            "quantidadeRecheiosSelecionados"
        );

    const mensagem =
        document.getElementById(
            "mensagemLimiteRecheios"
        );

    if (contador) {
        contador.textContent =
            selecionados.length;
    }

    if (mensagem) {

        mensagem.textContent =
            selecionados.length === 2
                ? "Você já escolheu os 2 recheios permitidos."
                : "";

    }

    document.querySelectorAll(
        'input[name="recheio"]'
    ).forEach(input => {

        input.disabled =
            selecionados.length >= 2 &&
            !input.checked;

    });
}

function configurarEventosMontagemBolo() {

    const painel =
        document.getElementById(
            "painelBolo"
        );

    if (!painel) {
        return;
    }

    painel.addEventListener(
        "change",
        function(event) {

            const input =
                event.target.closest(
                    'input[type="radio"], input[type="checkbox"]'
                );

            if (!input) {
                return;
            }

            if (input.name === "recheio") {

                const selecionados =
                    recheiosSelecionados();

                if (selecionados.length > 2) {
                    input.checked = false;

                    alert(
                        "Você pode escolher no máximo 2 recheios."
                    );
                }

                atualizarContadorRecheios();
            }

            atualizarResumoBolo();
        }
    );
}

async function carregarMontagemBolo() {

    const paginaMontarBolo =
        document.querySelector(
            ".pagina-montar-bolo"
        );

    if (!paginaMontarBolo) {
        return;
    }

    try {

        opcoesBoloSupabase =
            await buscarOpcoesBoloSupabase();

        renderizarOpcoesBoloSupabase();
        configurarEventosMontagemBolo();
        atualizarContadorRecheios();
        atualizarResumoBolo();

    } catch (erro) {

        console.error(
            "Erro ao carregar opções do bolo:",
            erro
        );

        [
            "opcoesTamanho",
            "opcoesMassa",
            "opcoesRecheio",
            "opcoesAdicionais"
        ].forEach(id => {

            const elemento =
                document.getElementById(id);

            if (elemento) {
                elemento.innerHTML = `
                    <div class="opcoes-indisponiveis">
                        Não foi possível carregar as opções.
                        Atualize a página e tente novamente.
                    </div>
                `;
            }

        });
    }
}

document.addEventListener(
    "DOMContentLoaded",
    function () {

        atualizarContadorCarrinho();
        carregarMontagemBolo();

    }
);


/* =====================================================
   ATUALIZAR RESUMO
===================================================== */

function atualizarResumoBolo() {

    const tamanho =
        document.querySelector(
            'input[name="tamanho"]:checked'
        );

    const massa =
        document.querySelector(
            'input[name="massa"]:checked'
        );

    const recheios =
        recheiosSelecionados();

    const adicionais =
        adicionaisSelecionados();

    const topo =
        document.querySelector(
            'input[name="topo"]:checked'
        );


    const resumoTamanho =
        document.getElementById(
            "resumoTamanho"
        );

    if (resumoTamanho) {

        resumoTamanho.textContent =
            tamanho
                ? tamanho.value
                : "—";

    }


    const resumoMassa =
        document.getElementById(
            "resumoMassa"
        );

    if (resumoMassa) {

        resumoMassa.textContent =
            massa
                ? massa.value
                : "—";

    }


    const resumoRecheio =
        document.getElementById(
            "resumoRecheio"
        );

    if (resumoRecheio) {

        resumoRecheio.textContent =
            recheios.length
                ? recheios
                    .map(item => item.value)
                    .join(" + ")
                : "—";

    }


    const resumoAdicionais =
        document.getElementById(
            "resumoAdicionais"
        );

    if (resumoAdicionais) {

        const adicionaisComValor = [];

        if (
            massa &&
            Number(massa.dataset.preco || 0) > 0
        ) {
            adicionaisComValor.push(
                `${massa.value} (+ ${formatarMoeda(
                    Number(massa.dataset.preco || 0)
                )})`
            );
        }

        recheios.forEach(item => {

            const preco =
                Number(item.dataset.preco || 0);

            if (preco > 0) {
                adicionaisComValor.push(
                    `${item.value} (+ ${formatarMoeda(preco)})`
                );
            }

        });

        adicionais.forEach(item => {

            const preco =
                Number(item.dataset.preco || 0);

            adicionaisComValor.push(
                preco > 0
                    ? `${item.value} (+ ${formatarMoeda(preco)})`
                    : item.value
            );

        });

        resumoAdicionais.textContent =
            adicionaisComValor.length
                ? adicionaisComValor.join(", ")
                : "Nenhum";

    }


    const resumoTopo =
        document.getElementById(
            "resumoTopo"
        );

    if (resumoTopo) {

        resumoTopo.textContent =
            topo
                ? (
                    topo.value ===
                    "Quero topo personalizado"
                        ? "Sim — valor a confirmar"
                        : "Não"
                )
                : "—";

    }


    let valorTotal = 0;


    if (tamanho) {
        valorTotal +=
            Number(
                tamanho.dataset.preco || 0
            );
    }

    if (massa) {
        valorTotal +=
            Number(
                massa.dataset.preco || 0
            );
    }

    recheios.forEach(item => {
        valorTotal +=
            Number(
                item.dataset.preco || 0
            );
    });

    adicionais.forEach(item => {
        valorTotal +=
            Number(
                item.dataset.preco || 0
            );
    });


    const campoTotal =
        document.getElementById(
            "valorTotalBolo"
        );


    if (campoTotal) {

        campoTotal.textContent =
            formatarMoeda(valorTotal);

    }

}


/* =====================================================
   ADICIONAR BOLO AO CARRINHO
===================================================== */

async function adicionarBoloCarrinho() {
    if (!horarioRetiradaValido(document.getElementById("horaRetirada"))) {
        return;
    }

    const campoDataBloqueioAtual = document.getElementById("dataRetirada");
    if (!validarDataRetiradaDisponivel(campoDataBloqueioAtual, true)) {
        return;
    }


    const tamanho =
        document.querySelector(
            'input[name="tamanho"]:checked'
        );

    const massa =
        document.querySelector(
            'input[name="massa"]:checked'
        );

    const recheios =
        recheiosSelecionados();

    const adicionais =
        adicionaisSelecionados();

    const topo =
        document.querySelector(
            'input[name="topo"]:checked'
        );

    const cor =
        document
            .getElementById("corBolo")
            ?.value
            .trim();

    const data =
        document
            .getElementById("dataRetirada")
            ?.value;

    const horario =
        document
            .getElementById("horaRetirada")
            ?.value;


    if (!tamanho) {
        alert("Escolha o tamanho do bolo.");
        return;
    }

    if (!massa) {
        alert("Escolha a massa do bolo.");
        return;
    }

    if (recheios.length === 0) {
        alert("Escolha pelo menos 1 recheio.");
        return;
    }

    if (recheios.length > 2) {
        alert("Escolha no máximo 2 recheios.");
        return;
    }

    if (!cor) {
        alert("Informe a cor principal do bolo.");
        return;
    }

    if (!topo) {
        alert(
            "Informe se deseja topo de bolo."
        );
        return;
    }

    if (!data) {
        alert(
            "Escolha a data da retirada."
        );
        return;
    }

    if (!horario) {
        alert(
            "Escolha o horário da retirada."
        );
        return;
    }


    /* =================================================
       VALORES DO BOLO
       Mantemos cada parte separada para garantir que qualquer
       adicional selecionado entre no carrinho, checkout e pedido.
    ================================================= */

    const valorTamanho =
        Number(tamanho.dataset.preco || 0);

    const valorMassa =
        Number(massa.dataset.preco || 0);

    const valorRecheios =
        recheios.reduce(
            (soma, item) =>
                soma + Number(item.dataset.preco || 0),
            0
        );

    const valorAdicionais =
        adicionais.reduce(
            (soma, item) =>
                soma + Number(item.dataset.preco || 0),
            0
        );

    const valorTotal =
        valorTamanho +
        valorMassa +
        valorRecheios +
        valorAdicionais;

    const adicionaisCobrados = [];

    if (valorMassa > 0) {
        adicionaisCobrados.push({
            origem: "Massa",
            nome: massa.value,
            valor: valorMassa
        });
    }

    recheios.forEach(item => {

        const valor =
            Number(item.dataset.preco || 0);

        if (valor > 0) {
            adicionaisCobrados.push({
                origem: "Recheio",
                nome: item.value,
                valor
            });
        }

    });

    adicionais.forEach(item => {

        const valor =
            Number(item.dataset.preco || 0);

        adicionaisCobrados.push({
            origem: "Adicional",
            nome: item.value,
            valor
        });

    });


    const fotoBolo =
        document.getElementById(
            "fotoBolo"
        )?.files[0];

    const fotoTopo =
        document.getElementById(
            "fotoTopo"
        )?.files[0];

    if (
        topo.value ===
        "Quero topo personalizado" &&
        !fotoTopo
    ) {
        alert(
            "Envie uma foto de referência do topo para solicitar o orçamento."
        );
        return;
    }


    let fotoBoloUrl = null;
    let fotoTopoUrl = null;

    const botaoAdicionar =
        document.querySelector(
            ".btn-adicionar-bolo"
        );

    const textoOriginalBotao =
        botaoAdicionar?.textContent;

    try {

        if (botaoAdicionar) {
            botaoAdicionar.disabled = true;
            botaoAdicionar.textContent =
                "Adicionando...";
        }

        if (fotoBolo) {

            fotoBoloUrl =
                await enviarImagemParaSupabase(
                    fotoBolo,
                    "bolo"
                );

        }

        if (fotoTopo) {

            fotoTopoUrl =
                await enviarImagemParaSupabase(
                    fotoTopo,
                    "topo"
                );

        }

    } catch (erro) {

        console.error(
            "Erro no upload da inspiração:",
            erro
        );

        alert(
            erro?.message ||
            "Não foi possível enviar a imagem de inspiração."
        );

        return;

    } finally {

        if (botaoAdicionar) {
            botaoAdicionar.disabled = false;
            botaoAdicionar.textContent =
                textoOriginalBotao ||
                "Adicionar ao carrinho";
        }

    }


    const bolo = {

        id:
            Date.now(),

        tipo:
            "bolo-personalizado",

        nome:
            "Bolo personalizado",

        tamanho:
            tamanho.value,

        massa:
            massa.value,

        recheio:
            recheios
                .map(item => item.value)
                .join(" + "),

        recheios:
            recheios
                .map(item => item.value),

        adicionais:
            adicionais
                .map(item => item.value),

        adicionaisCobrados:
            adicionaisCobrados,

        cor:
            cor,

        topo:
            topo.value ===
            "Quero topo personalizado"
                ? "Sim — valor a confirmar"
                : "Não",

        topoValorPendente:
            topo.value ===
            "Quero topo personalizado",

        data:
            data,

        horario:
            horario,

        fotoBoloNome:
            fotoBolo
                ? fotoBolo.name
                : null,

        fotoBoloUrl:
            fotoBoloUrl,

        fotoTopoNome:
            fotoTopo
                ? fotoTopo.name
                : null,

        fotoTopoUrl:
            fotoTopoUrl,

        /* detalhamento financeiro do bolo */
        valorTamanho:
            valorTamanho,

        valorMassa:
            valorMassa,

        valorRecheios:
            valorRecheios,

        valorAdicionais:
            valorAdicionais,

        preco:
            valorTotal,

        quantidade:
            1

    };


    carrinho.push(bolo);

    salvarCarrinho();


    alert(
        "Bolo adicionado ao carrinho!\n\n" +
        "Total parcial: " +
        formatarMoeda(valorTotal) +
        (
            bolo.topoValorPendente
                ? "\nO valor do topo será confirmado depois."
                : ""
        )
    );

}

/* =====================================================
   EXIBIR CARRINHO
===================================================== */

document.addEventListener("DOMContentLoaded", function () {

    const listaCarrinho =
        document.getElementById("listaCarrinho");

    if (!listaCarrinho) {
        return;
    }

    renderizarCarrinho();

});


function renderizarCarrinho() {

    /* Compatibilidade com carrinhos antigos */
    carrinho.forEach(item => {

        if (
            item.tipo === "bolo-personalizado" &&
            !Array.isArray(item.adicionaisCobrados)
        ) {

            item.adicionaisCobrados = [];

            if (Number(item.valorMassa || 0) > 0) {
                item.adicionaisCobrados.push({
                    origem: "Massa",
                    nome: item.massa || "Massa",
                    valor: Number(item.valorMassa || 0)
                });
            }

            if (Number(item.valorRecheios || 0) > 0) {
                item.adicionaisCobrados.push({
                    origem: "Recheio",
                    nome: item.recheio || "Recheio",
                    valor: Number(item.valorRecheios || 0)
                });
            }

            if (
                Number(item.valorAdicionais || 0) > 0 &&
                Array.isArray(item.adicionais) &&
                item.adicionais.length
            ) {
                item.adicionaisCobrados.push({
                    origem: "Adicional",
                    nome: item.adicionais.join(", "),
                    valor: Number(item.valorAdicionais || 0)
                });
            }

        }

    });

    const lista =
        document.getElementById("listaCarrinho");

    if (!lista) {
        return;
    }


    lista.innerHTML = "";


    /* CARRINHO VAZIO */

    if (carrinho.length === 0) {

        lista.innerHTML = `
            <div class="carrinho-vazio">

                <h2>Seu carrinho está vazio</h2>

                <p>
                    Escolha um produto de pronta entrega
                    ou faça uma encomenda personalizada.
                </p>

                <a href="index.html">
                    Ver cardápio
                </a>

            </div>
        `;

        atualizarResumoCarrinho();

        return;

    }


    /* ITENS */

    carrinho.forEach(item => {

        const elemento =
            document.createElement("div");

        elemento.classList.add(
            "item-carrinho"
        );


        /* BOLO PERSONALIZADO */

        if (
            item.tipo ===
            "bolo-personalizado"
        ) {

            elemento.innerHTML = `

                <div>

                    <h3>
                        🎂 ${item.nome}
                    </h3>

                    <div class="detalhes-item">

                        <p>
                            <strong>Tamanho:</strong>
                            ${item.tamanho}
                        </p>

                        <p>
                            <strong>Massa:</strong>
                            ${item.massa}
                        </p>

                        <p>
                            <strong>Recheios:</strong>
                            ${item.recheio}
                        </p>

                        ${item.adicionais?.length ? `
                            <p>
                                <strong>Adicionais:</strong>
                                ${item.adicionais.join(", ")}
                            </p>
                        ` : ""}

                        ${item.adicionaisCobrados?.length ? `
                            <p>
                                <strong>Adicionais cobrados:</strong>
                                ${
                                    item.adicionaisCobrados
                                        .map(adicional =>
                                            `${adicional.nome} (+ ${formatarMoeda(adicional.valor)})`
                                        )
                                        .join(", ")
                                }
                            </p>
                        ` : ""}

                        <p>
                            <strong>Cor:</strong>
                            ${item.cor}
                        </p>

                        <p>
                            <strong>Topo:</strong>
                            ${item.topo}
                        </p>

                        ${item.topoValorPendente ? `
                            <p class="aviso-valor-topo">
                                Valor do topo será confirmado após orçamento da gráfica.
                            </p>
                        ` : ""}

                        <p>
                            <strong>Retirada:</strong>
                            ${formatarData(item.data)}
                            às ${item.horario}
                        </p>

                        ${item.fotoBoloUrl ? `
                            <p>
                                <strong>Inspiração do bolo:</strong>
                                <a href="${item.fotoBoloUrl}" target="_blank" rel="noopener noreferrer">
                                    Ver imagem
                                </a>
                            </p>
                        ` : ""}

                        ${item.fotoTopoUrl ? `
                            <p>
                                <strong>Inspiração do topo:</strong>
                                <a href="${item.fotoTopoUrl}" target="_blank" rel="noopener noreferrer">
                                    Ver imagem
                                </a>
                            </p>
                        ` : ""}

                    </div>

                </div>


                <div class="item-acoes">

                    <span class="item-preco">
                        ${formatarMoeda(
                            item.preco *
                            item.quantidade
                        )}
                    </span>

                    <div class="controle-quantidade">

                        <button
                            onclick="
                                alterarQuantidade(
                                    ${item.id},
                                    -1
                                )
                            "
                        >
                            −
                        </button>

                        <span>
                            ${item.quantidade}
                        </span>

                        <button
                            onclick="
                                alterarQuantidade(
                                    ${item.id},
                                    1
                                )
                            "
                        >
                            +
                        </button>

                    </div>

                    <button
                        class="btn-remover-item"
                        onclick="
                            removerItemCarrinho(
                                ${item.id}
                            )
                        "
                    >
                        Remover
                    </button>

                </div>

            `;

        }


        /* DOCINHOS */

        else if (
            item.tipo ===
            "docinhos"
        ) {

            elemento.innerHTML = `

                <div>

                    <h3>
                        🍬 ${item.nome}
                    </h3>

                    <div class="detalhes-item">

                        <p>
                            <strong>Categoria:</strong>
                            ${item.categoria}
                        </p>

                        <p>
                            <strong>Quantidade:</strong>
                            ${item.unidades} unidades
                        </p>

                        <p>
                            <strong>Sabores:</strong>
                            ${item.sabores.join(", ")}
                        </p>

                        <p>
                            <strong>${item.tipoCobranca === "pacote" ? "Pacote:" : "Valor unitário:"}</strong>
                            ${
                                item.tipoCobranca === "pacote"
                                    ? `${item.quantidadePacote} unidades por ${formatarMoeda(item.precoPacote)}`
                                    : formatarMoeda(item.precoUnitario)
                            }
                        </p>

                        <p>
                            <strong>Retirada:</strong>
                            ${formatarData(item.data)}
                            às ${item.horario}
                        </p>

                    </div>

                </div>

                <div class="item-acoes">

                    <span class="item-preco">
                        ${formatarMoeda(
                            item.preco *
                            item.quantidade
                        )}
                    </span>

                    <div class="controle-quantidade">

                        <button
                            onclick="
                                alterarQuantidade(
                                    ${item.id},
                                    -1
                                )
                            "
                        >
                            −
                        </button>

                        <span>
                            ${item.quantidade}
                        </span>

                        <button
                            onclick="
                                alterarQuantidade(
                                    ${item.id},
                                    1
                                )
                            "
                        >
                            +
                        </button>

                    </div>

                    <button
                        class="btn-remover-item"
                        onclick="
                            removerItemCarrinho(
                                ${item.id}
                            )
                        "
                    >
                        Remover
                    </button>

                </div>

            `;

        }


        /* CUPCAKES */

        else if (
            item.tipo ===
            "cupcakes"
        ) {

            elemento.innerHTML = `

                <div>

                    <h3>
                        🧁 ${item.nome}
                    </h3>

                    <div class="detalhes-item">

                        <p>
                            <strong>Quantidade:</strong>
                            ${item.unidades} unidade(s)
                        </p>

                        ${item.sabores?.length ? `
                            <p>
                                <strong>Sabores:</strong>
                                ${item.sabores.join(", ")}
                            </p>
                        ` : ""}

                        <p>
                            <strong>Valor unitário:</strong>
                            ${formatarMoeda(item.precoUnitario)}
                        </p>

                        <p>
                            <strong>Retirada:</strong>
                            ${formatarData(item.data)}
                            às ${item.horario}
                        </p>

                    </div>

                </div>

                <div class="item-acoes">

                    <span class="item-preco">
                        ${formatarMoeda(
                            item.preco *
                            item.quantidade
                        )}
                    </span>

                    <div class="controle-quantidade">
                        <button onclick="alterarQuantidade(${item.id}, -1)">−</button>
                        <span>${item.quantidade}</span>
                        <button onclick="alterarQuantidade(${item.id}, 1)">+</button>
                    </div>

                    <button
                        class="btn-remover-item"
                        onclick="removerItemCarrinho(${item.id})"
                    >
                        Remover
                    </button>

                </div>
            `;
        }


        /* KIT FESTA */

        else if (
            item.tipo ===
            "kit-festa"
        ) {

            elemento.innerHTML = `

                <div>

                    <h3>
                        🎉 ${item.nome}
                    </h3>

                    <div class="detalhes-item">

                        <p>
                            <strong>Composição:</strong>
                            ${item.composicao}
                        </p>

                        ${item.recheiosBolo?.length ? `
                            <p>
                                <strong>Recheio do bolo:</strong>
                                ${item.recheiosBolo.join(", ")}
                            </p>
                        ` : ""}

                        ${item.saboresDocinhos?.length ? `
                            <p>
                                <strong>Sabores dos docinhos:</strong>
                                ${item.saboresDocinhos.join(", ")}
                            </p>
                        ` : ""}

                        ${item.saboresCupcakes?.length ? `
                            <p>
                                <strong>Sabores dos cupcakes:</strong>
                                ${item.saboresCupcakes.join(", ")}
                            </p>
                        ` : ""}

                        <p>
                            <strong>Condição:</strong>
                            ${item.formaPagamento || "Valor do kit"}
                        </p>

                        <p>
                            <strong>Retirada:</strong>
                            ${formatarData(item.data)}
                            às ${item.horario}
                        </p>

                    </div>

                </div>

                <div class="item-acoes">

                    <span class="item-preco">
                        ${formatarMoeda(
                            item.preco *
                            item.quantidade
                        )}
                    </span>

                    <div class="controle-quantidade">
                        <button onclick="alterarQuantidade(${item.id}, -1)">−</button>
                        <span>${item.quantidade}</span>
                        <button onclick="alterarQuantidade(${item.id}, 1)">+</button>
                    </div>

                    <button
                        class="btn-remover-item"
                        onclick="removerItemCarrinho(${item.id})"
                    >
                        Remover
                    </button>

                </div>
            `;
        }


        /* BOLO CASEIRINHO */

        else if (
            item.tipo ===
            "caseirinho"
        ) {

            elemento.innerHTML = `

                <div>

                    <h3>
                        🍊 ${item.nome}
                    </h3>

                    <div class="detalhes-item">

                        <p>
                            <strong>Sabor:</strong>
                            ${item.sabor}
                        </p>

                        <p>
                            <strong>Tamanho:</strong>
                            ${item.tamanho}
                        </p>

                        <p>
                            <strong>Retirada:</strong>
                            ${formatarData(item.data)}
                            às ${item.horario}
                        </p>

                    </div>

                </div>

                <div class="item-acoes">

                    <span class="item-preco">
                        ${formatarMoeda(
                            item.preco *
                            item.quantidade
                        )}
                    </span>

                    <div class="controle-quantidade">
                        <button onclick="alterarQuantidade(${item.id}, -1)">−</button>
                        <span>${item.quantidade}</span>
                        <button onclick="alterarQuantidade(${item.id}, 1)">+</button>
                    </div>

                    <button
                        class="btn-remover-item"
                        onclick="removerItemCarrinho(${item.id})"
                    >
                        Remover
                    </button>

                </div>
            `;
        }


        /* PRODUTO DE PRONTA ENTREGA */

        else {

            elemento.innerHTML = `

                <div>

                    <h3>
                        ✨ ${item.nome}
                    </h3>

                    <div class="detalhes-item">

                        <p>
                            <strong>Categoria:</strong>
                            ${item.categoria}
                        </p>

                        ${
                            item.estoqueMax !== null &&
                            item.estoqueMax !== undefined
                                ? `
                                    <p>
                                        <strong>Disponível:</strong>
                                        ${Number(item.estoqueMax)} unidade${Number(item.estoqueMax) === 1 ? "" : "s"}
                                    </p>
                                `
                                : ""
                        }

                    </div>

                </div>


                <div class="item-acoes">

                    <span class="item-preco">
                        ${formatarMoeda(
                            item.preco *
                            item.quantidade
                        )}
                    </span>

                    <div class="controle-quantidade">

                        <button
                            onclick="
                                alterarQuantidade(
                                    ${item.id},
                                    -1
                                )
                            "
                        >
                            −
                        </button>

                        <span>
                            ${item.quantidade}
                        </span>

                        <button
                            onclick="
                                alterarQuantidade(
                                    ${item.id},
                                    1
                                )
                            "
                        >
                            +
                        </button>

                    </div>

                    <button
                        class="btn-remover-item"
                        onclick="
                            removerItemCarrinho(
                                ${item.id}
                            )
                        "
                    >
                        Remover
                    </button>

                </div>

            `;

        }


        lista.appendChild(elemento);

    });


    atualizarResumoCarrinho();

}


/* =====================================================
   ALTERAR QUANTIDADE
===================================================== */

function alterarQuantidade(id, alteracao) {

    const item =
        carrinho.find(
            item => item.id === id
        );

    if (!item) {
        return;
    }

    const novaQuantidade =
        Number(item.quantidade || 1) +
        Number(alteracao || 0);

    if (novaQuantidade <= 0) {

        removerItemCarrinho(id);

        return;
    }

    if (
        item.tipo === "produto" &&
        item.estoqueMax !== null &&
        item.estoqueMax !== undefined &&
        novaQuantidade > Number(item.estoqueMax)
    ) {

        alert(
            `Só existem ${Number(item.estoqueMax)} unidade${Number(item.estoqueMax) === 1 ? "" : "s"} disponível${Number(item.estoqueMax) === 1 ? "" : "is"} deste produto.`
        );

        return;
    }

    item.quantidade =
        novaQuantidade;

    salvarCarrinho();

    renderizarCarrinho();

}


/* =====================================================
   REMOVER ITEM
===================================================== */

function removerItemCarrinho(id) {

    carrinho =
        carrinho.filter(
            item => item.id !== id
        );


    salvarCarrinho();

    renderizarCarrinho();

}


/* =====================================================
   RESUMO
===================================================== */

function atualizarResumoCarrinho() {

    const totalItens =
        carrinho.reduce(
            (total, item) =>
                total +
                item.quantidade,
            0
        );


    const subtotal =
        carrinho.reduce(
            (total, item) =>
                total +
                (
                    item.preco *
                    item.quantidade
                ),
            0
        );


    const campoItens =
        document.getElementById(
            "totalItens"
        );

    const campoSubtotal =
        document.getElementById(
            "subtotalCarrinho"
        );

    const campoTotal =
        document.getElementById(
            "totalCarrinho"
        );


    if (campoItens) {
        campoItens.textContent =
            totalItens;
    }


    if (campoSubtotal) {
        campoSubtotal.textContent =
            formatarMoeda(subtotal);
    }


    if (campoTotal) {
        campoTotal.textContent =
            formatarMoeda(subtotal);
    }

}


/* =====================================================
   FORMATAR DATA
===================================================== */

function formatarData(data) {

    if (!data) {
        return "";
    }


    const partes =
        data.split("-");


    return (
        partes[2] +
        "/" +
        partes[1] +
        "/" +
        partes[0]
    );

}


/* =====================================================
   CONTINUAR PEDIDO
===================================================== */

function irParaCheckout() {

    if (carrinho.length === 0) {

        alert("Seu carrinho está vazio.");

        return;
    }

    window.location.href = "checkout.html";
}/* =====================================================
   CHECKOUT
===================================================== */

document.addEventListener("DOMContentLoaded", function () {

    const itensCheckout =
        document.getElementById("itensCheckout");

    if (!itensCheckout) {
        return;
    }

    renderizarCheckout();

});


function renderizarCheckout() {

    const container =
        document.getElementById("itensCheckout");

    if (!container) {
        return;
    }


    container.innerHTML = "";


    if (carrinho.length === 0) {

        container.innerHTML = `
            <p style="font-size: 11px; color: #806b62;">
                Nenhum item no pedido.
            </p>
        `;

        atualizarResumoCheckout();

        return;

    }


    carrinho.forEach(item => {

        const elemento =
            document.createElement("div");

        elemento.classList.add("item-checkout");


        if (item.tipo === "bolo-personalizado") {

            elemento.innerHTML = `

                <div class="item-checkout-info">

                    <h3>
                        🎂 ${item.nome}
                    </h3>

                    <p>
                        <strong>Tamanho:</strong>
                        ${item.tamanho}
                    </p>

                    <p>
                        <strong>Massa:</strong>
                        ${item.massa}
                    </p>

                    <p>
                        <strong>Recheios:</strong>
                        ${item.recheio}
                    </p>

                    ${item.adicionais?.length ? `
                        <p>
                            <strong>Adicionais:</strong>
                            ${item.adicionais.join(", ")}
                        </p>
                    ` : ""}

                    ${item.adicionaisCobrados?.length ? `
                        <p>
                            <strong>Adicionais cobrados:</strong>
                            ${
                                item.adicionaisCobrados
                                    .map(adicional =>
                                        `${adicional.nome} (+ ${formatarMoeda(adicional.valor)})`
                                    )
                                    .join(", ")
                            }
                        </p>
                    ` : ""}

                    <p>
                        <strong>Cor:</strong>
                        ${item.cor}
                    </p>

                    <p>
                        <strong>Topo:</strong>
                        ${item.topo}
                    </p>

                    ${item.topoValorPendente ? `
                        <p class="aviso-valor-topo">
                            Valor do topo será confirmado após orçamento da gráfica.
                        </p>
                    ` : ""}

                    <p>
                        <strong>Retirada:</strong>
                        ${formatarData(item.data)}
                        às ${item.horario}
                    </p>

                    ${item.fotoBoloUrl ? `
                        <p>
                            <strong>Inspiração do bolo:</strong>
                            <a href="${item.fotoBoloUrl}" target="_blank" rel="noopener noreferrer">
                                Ver imagem
                            </a>
                        </p>
                    ` : ""}

                    ${item.fotoTopoUrl ? `
                        <p>
                            <strong>Inspiração do topo:</strong>
                            <a href="${item.fotoTopoUrl}" target="_blank" rel="noopener noreferrer">
                                Ver imagem
                            </a>
                        </p>
                    ` : ""}

                    <p>
                        <strong>Quantidade:</strong>
                        ${item.quantidade}
                    </p>

                </div>

                <div class="item-checkout-preco">

                    ${formatarMoeda(
                        item.preco *
                        item.quantidade
                    )}

                </div>

            `;

        } else if (item.tipo === "docinhos") {

            elemento.innerHTML = `

                <div class="item-checkout-info">

                    <h3>
                        🍬 ${item.nome}
                    </h3>

                    <p>
                        <strong>Categoria:</strong>
                        ${item.categoria}
                    </p>

                    <p>
                        <strong>Quantidade:</strong>
                        ${item.unidades} unidades
                    </p>

                    <p>
                        <strong>Sabores:</strong>
                        ${item.sabores.join(", ")}
                    </p>

                    <p>
                        <strong>Valor unitário:</strong>
                        ${formatarMoeda(item.precoUnitario)}
                    </p>

                    <p>
                        <strong>Retirada:</strong>
                        ${formatarData(item.data)}
                        às ${item.horario}
                    </p>

                </div>

                <div class="item-checkout-preco">

                    ${formatarMoeda(
                        item.preco *
                        item.quantidade
                    )}

                </div>

            `;

        } else if (item.tipo === "cupcakes") {

            elemento.innerHTML = `

                <div class="item-checkout-info">

                    <h3>🧁 ${item.nome}</h3>

                    <p>
                        <strong>Quantidade:</strong>
                        ${item.unidades} unidade(s)
                    </p>

                    ${item.sabores?.length ? `
                        <p>
                            <strong>Sabores:</strong>
                            ${item.sabores.join(", ")}
                        </p>
                    ` : ""}

                    <p>
                        <strong>Valor unitário:</strong>
                        ${formatarMoeda(item.precoUnitario)}
                    </p>

                    <p>
                        <strong>Retirada:</strong>
                        ${formatarData(item.data)}
                        às ${item.horario}
                    </p>

                </div>

                <div class="item-checkout-preco">
                    ${formatarMoeda(item.preco * item.quantidade)}
                </div>
            `;

        } else if (item.tipo === "kit-festa") {

            elemento.innerHTML = `

                <div class="item-checkout-info">

                    <h3>🎉 ${item.nome}</h3>

                    <p>
                        <strong>Composição:</strong>
                        ${item.composicao}
                    </p>

                    ${item.recheiosBolo?.length ? `
                        <p>
                            <strong>Recheio do bolo:</strong>
                            ${item.recheiosBolo.join(", ")}
                        </p>
                    ` : ""}

                    ${item.saboresDocinhos?.length ? `
                        <p>
                            <strong>Sabores dos docinhos:</strong>
                            ${item.saboresDocinhos.join(", ")}
                        </p>
                    ` : ""}

                    ${item.saboresCupcakes?.length ? `
                        <p>
                            <strong>Sabores dos cupcakes:</strong>
                            ${item.saboresCupcakes.join(", ")}
                        </p>
                    ` : ""}

                    <p>
                        <strong>Condição:</strong>
                        ${item.formaPagamento || "Valor do kit"}
                    </p>

                    <p>
                        <strong>Retirada:</strong>
                        ${formatarData(item.data)}
                        às ${item.horario}
                    </p>

                </div>

                <div class="item-checkout-preco">
                    ${formatarMoeda(item.preco * item.quantidade)}
                </div>
            `;

        } else if (item.tipo === "caseirinho") {

            elemento.innerHTML = `

                <div class="item-checkout-info">

                    <h3>🍊 ${item.nome}</h3>

                    <p>
                        <strong>Sabor:</strong>
                        ${item.sabor}
                    </p>

                    <p>
                        <strong>Tamanho:</strong>
                        ${item.tamanho}
                    </p>

                    <p>
                        <strong>Retirada:</strong>
                        ${formatarData(item.data)}
                        às ${item.horario}
                    </p>

                </div>

                <div class="item-checkout-preco">
                    ${formatarMoeda(item.preco * item.quantidade)}
                </div>
            `;

        } else {

            elemento.innerHTML = `

                <div class="item-checkout-info">

                    <h3>
                        ✨ ${item.nome}
                    </h3>

                    <p>
                        <strong>Categoria:</strong>
                        ${item.categoria}
                    </p>

                    <p>
                        <strong>Quantidade:</strong>
                        ${item.quantidade}
                    </p>

                </div>

                <div class="item-checkout-preco">

                    ${formatarMoeda(
                        item.preco *
                        item.quantidade
                    )}

                </div>

            `;

        }


        container.appendChild(elemento);

    });


    atualizarResumoCheckout();

}


/* =====================================================
   RESUMO DO CHECKOUT
===================================================== */

function atualizarResumoCheckout() {

    const quantidade =
        carrinho.reduce(
            (total, item) =>
                total + item.quantidade,
            0
        );


    const subtotal =
        carrinho.reduce(
            (total, item) =>
                total +
                (
                    item.preco *
                    item.quantidade
                ),
            0
        );


    const campoQuantidade =
        document.getElementById(
            "quantidadeCheckout"
        );

    const campoSubtotal =
        document.getElementById(
            "subtotalCheckout"
        );

    const campoTotal =
        document.getElementById(
            "totalCheckout"
        );


    if (campoQuantidade) {
        campoQuantidade.textContent =
            quantidade;
    }


    if (campoSubtotal) {
        campoSubtotal.textContent =
            formatarMoeda(subtotal);
    }


    if (campoTotal) {
        campoTotal.textContent =
            formatarMoeda(subtotal);
    }

}


/* =====================================================
   FINALIZAR PELO WHATSAPP
===================================================== */


/* =====================================================
   PEDIDOS - SUPABASE
===================================================== */

const SITE_PUBLICO_URL = "https://gorete-festas.netlify.app";

function montarDetalhesItemPedido(item) {
    const detalhes = { ...item };

    delete detalhes.id;
    delete detalhes.preco;
    delete detalhes.quantidade;

    return detalhes;
}

function montarImagensItemPedido(item) {
    const imagens = [];

    if (item.fotoBoloUrl) {
        imagens.push({
            url: item.fotoBoloUrl,
            nome_arquivo: item.fotoBoloNome || "inspiracao-bolo"
        });
    }

    if (item.fotoTopoUrl) {
        imagens.push({
            url: item.fotoTopoUrl,
            nome_arquivo: item.fotoTopoNome || "inspiracao-topo"
        });
    }

    return imagens;
}

function montarItensParaSalvarPedido() {
    return carrinho.map(item => {
        const quantidadePedido = Number(item.quantidade || 1);
        const valorTotal = Number(item.preco || 0) * quantidadePedido;

        let valorUnitario = Number(item.precoUnitario || 0);

        if (!valorUnitario && quantidadePedido > 0) {
            valorUnitario = Number(item.preco || 0);
        }

        return {
            tipo_produto: item.tipo || "produto",
            nome_produto: item.nome || "Produto",
            quantidade: quantidadePedido,
            valor_unitario: valorUnitario,
            valor_total: valorTotal,
            data_retirada: item.data || null,
            horario_retirada: item.horario || null,
            detalhes: montarDetalhesItemPedido(item),
            imagens: montarImagensItemPedido(item)
        };
    });
}

async function consultarEstoqueProdutoProntaEntrega(produtoId) {

    const endpoint =
        `${SUPABASE_URL}/rest/v1/produtos_pronta_entrega` +
        `?id=eq.${encodeURIComponent(produtoId)}` +
        `&select=id,nome,estoque,ativo` +
        `&limit=1`;

    const resposta =
        await fetch(
            endpoint,
            {
                headers: {
                    "apikey": SUPABASE_PUBLISHABLE_KEY,
                    "Authorization":
                        `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
                }
            }
        );

    if (!resposta.ok) {
        throw new Error(
            "Não foi possível conferir o estoque antes de finalizar o pedido."
        );
    }

    const dados =
        await resposta.json();

    return dados?.[0] || null;
}


async function validarEstoqueCarrinhoAntesDoPedido() {

    const produtos =
        carrinho.filter(
            item =>
                item.tipo === "produto" &&
                item.produtoId !== null &&
                item.produtoId !== undefined
        );

    for (const item of produtos) {

        const produto =
            await consultarEstoqueProdutoProntaEntrega(
                item.produtoId
            );

        if (!produto || !produto.ativo) {
            throw new Error(
                `${item.nome} não está mais disponível para venda.`
            );
        }

        const estoqueAtual =
            Math.max(
                0,
                Number(produto.estoque || 0)
            );

        item.estoqueMax =
            estoqueAtual;

        if (
            Number(item.quantidade || 1) >
            estoqueAtual
        ) {
            throw new Error(
                estoqueAtual === 0
                    ? `${item.nome} está esgotado. Remova o produto do carrinho para continuar.`
                    : `${item.nome} possui somente ${estoqueAtual} unidade${estoqueAtual === 1 ? "" : "s"} disponível${estoqueAtual === 1 ? "" : "is"}. Ajuste a quantidade no carrinho.`
            );
        }
    }

    salvarCarrinho();
}


async function baixarEstoqueItensProntaEntrega() {

    const produtos =
        carrinho.filter(
            item =>
                item.tipo === "produto" &&
                item.produtoId !== null &&
                item.produtoId !== undefined
        );

    for (const item of produtos) {

        const resposta =
            await fetch(
                `${SUPABASE_URL}/rest/v1/rpc/baixar_estoque_pronta_entrega`,
                {
                    method: "POST",
                    headers: {
                        "apikey": SUPABASE_PUBLISHABLE_KEY,
                        "Authorization":
                            `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        p_produto_id:
                            Number(item.produtoId),

                        p_quantidade:
                            Number(item.quantidade || 1)
                    })
                }
            );

        if (!resposta.ok) {

            let detalhe = "";

            try {
                const erro =
                    await resposta.json();

                detalhe =
                    erro.message ||
                    erro.error ||
                    "";
            } catch {
                detalhe =
                    await resposta.text();
            }

            throw new Error(
                `Não foi possível atualizar o estoque de ${item.nome}.` +
                (detalhe ? ` ${detalhe}` : "")
            );
        }
    }
}


async function salvarPedidoNoSupabase(nome, telefone, observacao) {

    await validarEstoqueCarrinhoAntesDoPedido();
    await validarCapacidadeCarrinhoAntesDoPedido();

    const total = carrinho.reduce(
        (soma, item) =>
            soma + Number(item.preco || 0) * Number(item.quantidade || 1),
        0
    );

    const payload = {
        p_cliente_nome: nome,
        p_cliente_whatsapp: telefone,
        p_valor_total: total,
        p_observacoes: observacao || null,
        p_itens: montarItensParaSalvarPedido()
    };

    const resposta = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/criar_pedido_publico`,
        {
            method: "POST",
            headers: {
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        }
    );

    if (!resposta.ok) {
        let detalhesErro = "";

        try {
            const erro = await resposta.json();
            detalhesErro =
                erro.message ||
                erro.error ||
                erro.hint ||
                JSON.stringify(erro);
        } catch {
            detalhesErro = await resposta.text();
        }

        throw new Error(
            "Não foi possível salvar o pedido." +
            (detalhesErro ? ` ${detalhesErro}` : "")
        );
    }

    const pedidoCriado =
        await resposta.json();

    await baixarEstoqueItensProntaEntrega();

    return pedidoCriado;
}


/* =====================================================
   FINALIZAR PELO WHATSAPP
===================================================== */

async function finalizarPedidoWhatsApp() {

    if (carrinho.length === 0) {
        alert("Seu carrinho está vazio.");
        return;
    }

    const nome =
        document.getElementById("nomeCliente")?.value.trim();

    const telefone =
        document.getElementById("telefoneCliente")?.value.trim();

    const observacao =
        document.getElementById("observacaoPedido")?.value.trim();

    if (!nome) {
        alert("Informe seu nome.");
        document.getElementById("nomeCliente")?.focus();
        return;
    }

    if (!telefone) {
        alert("Informe seu WhatsApp.");
        document.getElementById("telefoneCliente")?.focus();
        return;
    }

    const botao =
        document.querySelector(".btn-whatsapp-checkout");

    const textoOriginal =
        botao?.textContent || "Finalizar pelo WhatsApp";

    try {
        if (botao) {
            botao.disabled = true;
            botao.textContent = "Salvando pedido...";
        }

        const pedido =
            await salvarPedidoNoSupabase(
                nome,
                telefone,
                observacao
            );

        const codigo =
            pedido.codigo || "Pedido";

        const token =
            pedido.public_token;

        if (!token) {
            throw new Error(
                "O pedido foi salvo, mas o link público não foi gerado."
            );
        }

        const linkPedido =
            `${SITE_PUBLICO_URL}/pedido.html?token=${encodeURIComponent(token)}`;

        const quantidadeItens =
            carrinho.reduce(
                (total, item) =>
                    total + Number(item.quantidade || 1),
                0
            );

        const total =
            carrinho.reduce(
                (soma, item) =>
                    soma +
                    Number(item.preco || 0) *
                    Number(item.quantidade || 1),
                0
            );

        let mensagem =
            `🎂 *NOVO PEDIDO - GORETE FESTAS*\n\n`;

        mensagem +=
            `🧾 *Pedido:* ${codigo}\n`;

        mensagem +=
            `👤 *Cliente:* ${nome}\n`;

        mensagem +=
            `📱 *WhatsApp:* ${telefone}\n`;

        mensagem +=
            `🛒 *Itens:* ${quantidadeItens}\n`;

        mensagem +=
            `💰 *Total:* ${formatarMoeda(total)}\n`;

        if (observacao) {
            mensagem +=
                `📝 *Observação:* ${observacao}\n`;
        }

        mensagem +=
            `\n🔗 *Ver pedido completo:*\n${linkPedido}\n`;

        mensagem +=
            `\nNo link estão todos os produtos, sabores, quantidades, retirada e imagens de inspiração.`;

        const numeroWhatsApp =
            "5521994174117";

        const url =
            "https://wa.me/" +
            numeroWhatsApp +
            "?text=" +
            encodeURIComponent(mensagem);

        localStorage.setItem(
            "ultimoPedidoGorete",
            JSON.stringify({
                codigo,
                public_token: token,
                link: linkPedido
            })
        );

        carrinho = [];
        salvarCarrinho();

        window.location.href = url;

    } catch (erro) {

        console.error(
            "Erro ao finalizar pedido:",
            erro
        );

        alert(
            erro?.message ||
            "Não foi possível finalizar o pedido. Tente novamente."
        );

    } finally {

        if (botao) {
            botao.disabled = false;
            botao.textContent = textoOriginal;
        }
    }
}


/* =====================================================
   MÁSCARA DO WHATSAPP DO CLIENTE
===================================================== */

document.addEventListener("DOMContentLoaded", function () {

    const telefone =
        document.getElementById("telefoneCliente");

    if (!telefone) {
        return;
    }

    telefone.addEventListener("input", function () {

        let valor =
            this.value.replace(/\D/g, "");

        /* Limita a 11 números */
        if (valor.length > 11) {
            valor = valor.substring(0, 11);
        }

        /* Formatação progressiva */
        if (valor.length > 10) {

            valor = valor.replace(
                /^(\d{2})(\d{5})(\d{4})$/,
                "($1) $2-$3"
            );

        } else if (valor.length > 6) {

            valor = valor.replace(
                /^(\d{2})(\d{4})(\d{0,4})$/,
                "($1) $2-$3"
            );

        } else if (valor.length > 2) {

            valor = valor.replace(
                /^(\d{2})(\d+)/,
                "($1) $2"
            );

        } else if (valor.length > 0) {

            valor = valor.replace(
                /^(\d*)/,
                "($1"
            );

        }

        this.value = valor;

    });

});



/* =====================================================
   DOCINHOS - OPÇÕES E REGRAS VINDAS DO SUPABASE
===================================================== */

let opcoesDocinhosSupabase = [];
let regrasDocinhosSupabase = [];
let regraDocinhoAtual = null;

async function buscarOpcoesDocinhosSupabase() {

    const endpoint =
        `${SUPABASE_URL}/rest/v1/opcoes_encomenda` +
        `?tipo_produto=eq.docinho&ativo=eq.true&select=*` +
        `&order=grupo.asc,ordem.asc,created_at.asc`;

    const resposta = await fetch(endpoint, {
        headers: {
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
        }
    });

    if (!resposta.ok) {
        throw new Error("Não foi possível carregar os sabores de docinhos.");
    }

    return await resposta.json();
}

async function buscarRegrasDocinhosSupabase() {

    const endpoint =
        `${SUPABASE_URL}/rest/v1/regras_encomenda` +
        `?tipo_produto=eq.docinho&ativo=eq.true&select=*` +
        `&order=categoria.asc,quantidade_minima.asc,ordem.asc`;

    const resposta = await fetch(endpoint, {
        headers: {
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
        }
    });

    if (!resposta.ok) {
        throw new Error("Não foi possível carregar as regras dos docinhos.");
    }

    return await resposta.json();
}

function nomeCategoriaDocinho(categoria) {

    const nomes = {
        tradicional: "Tradicionais",
        premium: "Premium"
    };

    if (nomes[categoria]) {
        return nomes[categoria];
    }

    return String(categoria || "")
        .replaceAll("_", " ")
        .replace(/\b\w/g, letra => letra.toUpperCase());
}

function categoriasDocinhosDisponiveis() {

    const categorias = new Set();

    opcoesDocinhosSupabase.forEach(item => {
        if (item.grupo) {
            categorias.add(item.grupo);
        }
    });

    regrasDocinhosSupabase.forEach(item => {
        if (item.categoria) {
            categorias.add(item.categoria);
        }
    });

    return [...categorias];
}

function menorQuantidadeCategoriaDocinho(categoria) {

    const valores = regrasDocinhosSupabase
        .filter(regra => regra.categoria === categoria)
        .map(regra => Number(regra.quantidade_minima || 0))
        .filter(valor => valor > 0);

    return valores.length
        ? Math.min(...valores)
        : 1;
}

function menorPrecoCategoriaDocinho(categoria) {

    const valores = regrasDocinhosSupabase
        .filter(regra =>
            regra.categoria === categoria &&
            (regra.tipo_cobranca || "unidade") === "unidade"
        )
        .map(regra => Number(regra.preco_unitario || 0))
        .filter(valor => valor >= 0);

    return valores.length
        ? Math.min(...valores)
        : null;
}

function renderizarCategoriasDocinhos() {

    const container =
        document.getElementById("opcoesCategoriaDocinho");

    if (!container) {
        return;
    }

    const categorias =
        categoriasDocinhosDisponiveis();

    if (!categorias.length) {

        container.innerHTML = `
            <div class="opcoes-indisponiveis">
                Nenhuma categoria de docinhos foi cadastrada ainda.
            </div>
        `;

        return;
    }

    container.innerHTML = "";

    categorias.forEach(categoria => {

        const minimo =
            menorQuantidadeCategoriaDocinho(categoria);

        const menorPreco =
            menorPrecoCategoriaDocinho(categoria);

        const label =
            document.createElement("label");

        label.className = "opcao-card";

        label.innerHTML = `
            <input
                type="radio"
                name="categoriaDocinho"
                value="${escaparHtmlSite(categoria)}"
            >

            <span>
                <strong>${escaparHtmlSite(nomeCategoriaDocinho(categoria))}</strong>
                <small>
                    ${
                        menorPreco !== null
                            ? `A partir de ${formatarMoeda(menorPreco)} / unidade`
                            : "Preço conforme regra cadastrada"
                    }
                </small>
                <em>
                    ${
                        minimo > 1
                            ? `Pedido mínimo a partir de ${minimo} unidades`
                            : "Quantidade conforme regra cadastrada"
                    }
                </em>
            </span>
        `;

        container.appendChild(label);
    });
}

function categoriaDocinhoSelecionada() {

    return document.querySelector(
        'input[name="categoriaDocinho"]:checked'
    )?.value || "";
}

function saboresDocinhosSelecionados() {

    return [
        ...document.querySelectorAll(
            'input[name="saborDocinho"]:checked'
        )
    ];
}

function ehPacoteDocinhoAtual() {
    return (
        regraDocinhoAtual &&
        (regraDocinhoAtual.tipo_cobranca || "unidade") === "pacote"
    );
}

function distribuicaoSaboresDocinhosPacote() {

    return [
        ...document.querySelectorAll(
            ".quantidade-sabor-docinho"
        )
    ]
        .map(input => ({
            nome: input.dataset.sabor || "",
            quantidade: Number(input.value || 0),
            input
        }))
        .filter(item => item.quantidade > 0);
}

function totalDistribuidoDocinhosPacote() {

    return distribuicaoSaboresDocinhosPacote()
        .reduce(
            (total, item) => total + item.quantidade,
            0
        );
}

function renderizarSaboresDocinhos() {

    const container =
        document.getElementById("opcoesSaboresDocinho");

    if (!container) {
        return;
    }

    const categoria =
        categoriaDocinhoSelecionada();

    if (!categoria) {

        container.innerHTML = `
            <div class="opcoes-indisponiveis">
                Escolha primeiro uma categoria.
            </div>
        `;

        return;
    }

    const sabores =
        opcoesDocinhosSupabase
            .filter(item => item.grupo === categoria)
            .sort(
                (a, b) =>
                    Number(a.ordem || 0) -
                    Number(b.ordem || 0)
            );

    if (!sabores.length) {

        container.innerHTML = `
            <div class="opcoes-indisponiveis">
                Nenhum sabor disponível nesta categoria.
            </div>
        `;

        return;
    }

    container.innerHTML = "";

    const ehPacote =
        ehPacoteDocinhoAtual();

    const minimoPorSabor =
        ehPacote
            ? Number(
                regraDocinhoAtual.quantidade_minima_por_sabor || 0
            )
            : 0;

    sabores.forEach(sabor => {

        const label =
            document.createElement("label");

        if (ehPacote) {

            label.className =
                "opcao-card opcao-card-distribuicao";

            label.innerHTML = `
                <span class="info-sabor-pacote">
                    <strong>${escaparHtmlSite(sabor.nome)}</strong>
                    <small>
                        ${
                            minimoPorSabor > 0
                                ? `Mínimo ${minimoPorSabor} se escolher`
                                : "Informe a quantidade desejada"
                        }
                    </small>
                    ${
                        sabor.descricao
                            ? `<em>${escaparHtmlSite(sabor.descricao)}</em>`
                            : ""
                    }
                </span>

                <div class="controle-sabor-pacote">
                    <input
                        type="number"
                        class="quantidade-sabor-docinho"
                        data-sabor="${escaparHtmlSite(sabor.nome)}"
                        data-minimo="${minimoPorSabor}"
                        min="0"
                        step="1"
                        value="0"
                        title="${
                            minimoPorSabor > 0
                                ? `Use 0 ou no mínimo ${minimoPorSabor} unidades`
                                : "Informe a quantidade desejada"
                        }"
                        aria-label="Quantidade de ${escaparHtmlSite(sabor.nome)}"
                    >
                    <span>un.</span>
                </div>
            `;

        } else {

            label.className = "opcao-card";

            label.innerHTML = `
                <input
                    type="checkbox"
                    name="saborDocinho"
                    value="${escaparHtmlSite(sabor.nome)}"
                    data-id="${sabor.id}"
                >

                <span>
                    <strong>${escaparHtmlSite(sabor.nome)}</strong>
                    <small>Disponível</small>
                    ${
                        sabor.descricao
                            ? `<em>${escaparHtmlSite(sabor.descricao)}</em>`
                            : ""
                    }
                </span>
            `;
        }

        container.appendChild(label);
    });

    atualizarLimiteSaboresDocinhos();
    atualizarResumoDocinhos();
}

function encontrarRegraDocinho(categoria, quantidade) {

    if (!categoria || !quantidade) {
        return null;
    }

    const regrasCategoria =
        regrasDocinhosSupabase.filter(
            regra => regra.categoria === categoria
        );

    // Pacotes têm prioridade quando a quantidade informada
    // corresponde a um múltiplo exato do pacote.
    const pacotesAplicaveis =
        regrasCategoria
            .filter(regra => {
                const tipo = regra.tipo_cobranca || "unidade";
                const quantidadePacote = Number(regra.quantidade_pacote || 0);

                return (
                    tipo === "pacote" &&
                    quantidadePacote > 0 &&
                    quantidade >= quantidadePacote &&
                    quantidade % quantidadePacote === 0
                );
            })
            .sort(
                (a, b) =>
                    Number(b.quantidade_pacote || 0) -
                    Number(a.quantidade_pacote || 0)
            );

    if (pacotesAplicaveis.length) {
        return pacotesAplicaveis[0];
    }

    const regrasUnidade =
        regrasCategoria
            .filter(regra =>
                (regra.tipo_cobranca || "unidade") === "unidade" &&
                Number(regra.quantidade_minima || 0) <= quantidade
            )
            .sort(
                (a, b) =>
                    Number(b.quantidade_minima || 0) -
                    Number(a.quantidade_minima || 0)
            );

    return regrasUnidade[0] || null;
}

function proximaRegraDocinho(categoria, quantidade) {

    return regrasDocinhosSupabase
        .filter(regra =>
            regra.categoria === categoria &&
            (regra.tipo_cobranca || "unidade") === "unidade" &&
            Number(regra.quantidade_minima || 0) > quantidade
        )
        .sort(
            (a, b) =>
                Number(a.quantidade_minima || 0) -
                Number(b.quantidade_minima || 0)
        )[0] || null;
}

function atualizarRegraDocinho() {

    const categoria =
        categoriaDocinhoSelecionada();

    const quantidade =
        Number(
            document.getElementById(
                "quantidadeDocinhos"
            )?.value || 0
        );

    const feedback =
        document.getElementById(
            "regraDocinhoFeedback"
        );

    regraDocinhoAtual =
        encontrarRegraDocinho(
            categoria,
            quantidade
        );

    if (!categoria) {

        if (feedback) {
            feedback.textContent =
                "Escolha uma categoria para visualizar as regras.";
            feedback.className =
                "regra-docinho-feedback";
        }

        atualizarLimiteSaboresDocinhos();
        atualizarResumoDocinhos();
        return;
    }

    if (!quantidade) {

        const minimo =
            menorQuantidadeCategoriaDocinho(
                categoria
            );

        if (feedback) {
            feedback.textContent =
                `Informe a quantidade. Pedido mínimo atual: ${minimo} unidade(s).`;
            feedback.className =
                "regra-docinho-feedback";
        }

        atualizarLimiteSaboresDocinhos();
        atualizarResumoDocinhos();
        return;
    }

    if (!regraDocinhoAtual) {

        const proxima =
            proximaRegraDocinho(
                categoria,
                quantidade
            );

        if (feedback) {
            feedback.textContent =
                proxima
                    ? `Para esta categoria, o pedido mínimo é ${Number(proxima.quantidade_minima)} unidades.`
                    : "Não existe uma regra ativa para esta quantidade.";

            feedback.className =
                "regra-docinho-feedback alerta";
        }

        atualizarLimiteSaboresDocinhos();
        atualizarResumoDocinhos();
        return;
    }

    const maxSabores =
        Number(
            regraDocinhoAtual.max_sabores || 0
        );

    if (feedback) {

        const ehPacote =
            (regraDocinhoAtual.tipo_cobranca || "unidade") === "pacote";

        const quantidadePacote =
            Number(regraDocinhoAtual.quantidade_pacote || 0);

        const precoPacote =
            Number(regraDocinhoAtual.preco_pacote || 0);

        const textoPreco = ehPacote
            ? `${quantidadePacote} unidades por ${formatarMoeda(precoPacote)}`
            : `${formatarMoeda(regraDocinhoAtual.preco_unitario)} por unidade`;

        feedback.innerHTML = `
            <strong>${textoPreco}</strong>
            ${
                maxSabores > 0
                    ? ` • até ${maxSabores} sabor(es)`
                    : ""
            }
        `;

        feedback.className =
            "regra-docinho-feedback sucesso";
    }

    renderizarSaboresDocinhos();
}

function atualizarLimiteSaboresDocinhos() {

    const contador =
        document.getElementById(
            "quantidadeSaboresDocinho"
        );

    const limite =
        document.getElementById(
            "limiteSaboresDocinho"
        );

    const ajuda =
        document.getElementById(
            "ajudaSaboresDocinho"
        );

    const mensagem =
        document.getElementById(
            "mensagemLimiteSaboresDocinho"
        );

    if (ehPacoteDocinhoAtual()) {

        const distribuicao =
            distribuicaoSaboresDocinhosPacote();

        const quantidadeTotal =
            Number(
                document.getElementById(
                    "quantidadeDocinhos"
                )?.value || 0
            );

        const totalDistribuido =
            distribuicao.reduce(
                (total, item) =>
                    total + item.quantidade,
                0
            );

        const minimoPorSabor =
            Number(
                regraDocinhoAtual
                    ?.quantidade_minima_por_sabor || 0
            );

        const maxSabores =
            Number(
                regraDocinhoAtual
                    ?.max_sabores || 0
            );

        if (contador) {
            contador.textContent =
                distribuicao.length;
        }

        if (limite) {
            limite.textContent =
                maxSabores > 0
                    ? `/${maxSabores} sabores`
                    : " sabores";
        }

        if (ajuda) {
            ajuda.textContent =
                `Distribua as ${quantidadeTotal} unidades entre os sabores. ` +
                (
                    minimoPorSabor > 0
                        ? `Cada sabor escolhido deve ter no mínimo ${minimoPorSabor} unidades.`
                        : ""
                );
        }

        const saboresAbaixoDoMinimo =
            distribuicao.filter(
                item =>
                    minimoPorSabor > 0 &&
                    item.quantidade > 0 &&
                    item.quantidade < minimoPorSabor
            );

        if (mensagem) {

            if (saboresAbaixoDoMinimo.length > 0) {

                const nomesInvalidos =
                    saboresAbaixoDoMinimo
                        .map(item => item.nome)
                        .join(", ");

                mensagem.textContent =
                    `${nomesInvalidos}: cada sabor escolhido precisa ter no mínimo ${minimoPorSabor} unidades.`;

            } else if (totalDistribuido < quantidadeTotal) {

                mensagem.textContent =
                    `Distribuído: ${totalDistribuido} de ${quantidadeTotal}. ` +
                    `Faltam ${quantidadeTotal - totalDistribuido} unidades.`;

            } else if (totalDistribuido > quantidadeTotal) {

                mensagem.textContent =
                    `Distribuído: ${totalDistribuido} de ${quantidadeTotal}. ` +
                    `Retire ${totalDistribuido - quantidadeTotal} unidades.`;

            } else {

                mensagem.textContent =
                    `Distribuição completa: ${quantidadeTotal} unidades.`;
            }
        }

        document.querySelectorAll(
            ".quantidade-sabor-docinho"
        ).forEach(input => {

            const valor =
                Number(input.value || 0);

            const invalido =
                valor > 0 &&
                minimoPorSabor > 0 &&
                valor < minimoPorSabor;

            input.classList.toggle(
                "quantidade-sabor-invalida",
                invalido
            );

            input.setCustomValidity(
                invalido
                    ? `Cada sabor escolhido precisa ter no mínimo ${minimoPorSabor} unidades.`
                    : ""
            );
        });

        return;
    }

    const selecionados =
        saboresDocinhosSelecionados();

    const maxSabores =
        Number(
            regraDocinhoAtual?.max_sabores || 0
        );

    if (contador) {
        contador.textContent =
            selecionados.length;
    }

    if (limite) {
        limite.textContent =
            maxSabores > 0
                ? `/${maxSabores} selecionados`
                : " selecionados";
    }

    if (ajuda) {
        ajuda.textContent =
            regraDocinhoAtual && maxSabores > 0
                ? `Você pode escolher até ${maxSabores} sabor(es) para esta quantidade.`
                : "A quantidade de sabores permitida será informada após escolher a quantidade.";
    }

    if (mensagem) {
        mensagem.textContent =
            maxSabores > 0 &&
            selecionados.length >= maxSabores
                ? `Você já escolheu o limite de ${maxSabores} sabor(es).`
                : "";
    }

    document.querySelectorAll(
        'input[name="saborDocinho"]'
    ).forEach(input => {

        input.disabled =
            maxSabores > 0 &&
            selecionados.length >= maxSabores &&
            !input.checked;
    });
}

function atualizarResumoDocinhos() {

    // Define antes do primeiro uso para evitar ReferenceError
    const ehPacote =
        regraDocinhoAtual &&
        (regraDocinhoAtual.tipo_cobranca || "unidade") === "pacote";


    const categoria =
        categoriaDocinhoSelecionada();

    const quantidade =
        Number(
            document.getElementById(
                "quantidadeDocinhos"
            )?.value || 0
        );

    const sabores =
        saboresDocinhosSelecionados();

    const distribuicaoPacote =
        ehPacoteDocinhoAtual()
            ? distribuicaoSaboresDocinhosPacote()
            : [];

    const categoriaResumo =
        document.getElementById(
            "resumoCategoriaDocinho"
        );

    const quantidadeResumo =
        document.getElementById(
            "resumoQuantidadeDocinho"
        );

    const saboresResumo =
        document.getElementById(
            "resumoSaboresDocinho"
        );

    const unitarioResumo =
        document.getElementById(
            "resumoPrecoUnitarioDocinho"
        );

    const totalResumo =
        document.getElementById(
            "valorTotalDocinhos"
        );

    if (categoriaResumo) {
        categoriaResumo.textContent =
            categoria
                ? nomeCategoriaDocinho(categoria)
                : "—";
    }

    if (quantidadeResumo) {
        quantidadeResumo.textContent =
            quantidade > 0
                ? `${quantidade} unidades`
                : "—";
    }

    if (saboresResumo) {
        saboresResumo.textContent =
            ehPacote
                ? (
                    distribuicaoPacote.length
                        ? distribuicaoPacote
                            .map(
                                item =>
                                    `${item.nome} (${item.quantidade})`
                            )
                            .join(", ")
                        : "—"
                )
                : (
                    sabores.length
                        ? sabores
                            .map(item => item.value)
                            .join(", ")
                        : "—"
                );
    }

    const rotuloPreco =
        document.getElementById("rotuloPrecoDocinho");



    const quantidadePacote =
        ehPacote
            ? Number(regraDocinhoAtual.quantidade_pacote || 0)
            : 0;

    const precoPacote =
        ehPacote
            ? Number(regraDocinhoAtual.preco_pacote || 0)
            : 0;

    if (rotuloPreco) {
        rotuloPreco.textContent =
            ehPacote
                ? "Valor do pacote"
                : "Valor unitário";
    }

    if (unitarioResumo) {
        unitarioResumo.textContent =
            regraDocinhoAtual
                ? (
                    ehPacote
                        ? `${formatarMoeda(precoPacote)} / ${quantidadePacote} un.`
                        : formatarMoeda(regraDocinhoAtual.preco_unitario)
                )
                : "—";
    }

    const total =
        regraDocinhoAtual
            ? (
                ehPacote && quantidadePacote > 0
                    ? (quantidade / quantidadePacote) * precoPacote
                    : quantidade * Number(regraDocinhoAtual.preco_unitario || 0)
            )
            : 0;

    if (totalResumo) {
        totalResumo.textContent =
            formatarMoeda(total);
    }
}

function configurarEventosDocinhos() {

    const painel =
        document.getElementById(
            "painelDocinhos"
        );

    if (!painel || painel.dataset.eventosAtivos === "true") {
        return;
    }

    painel.dataset.eventosAtivos = "true";

    painel.addEventListener(
        "change",
        function(event) {

            const alvo =
                event.target;

            if (alvo.name === "categoriaDocinho") {

                document.getElementById(
                    "quantidadeDocinhos"
                ).value = "";

                regraDocinhoAtual = null;

                renderizarSaboresDocinhos();
                atualizarRegraDocinho();
            }

            if (alvo.name === "saborDocinho") {

                const maxSabores =
                    Number(
                        regraDocinhoAtual?.max_sabores || 0
                    );

                const selecionados =
                    saboresDocinhosSelecionados();

                if (
                    maxSabores > 0 &&
                    selecionados.length > maxSabores
                ) {
                    alvo.checked = false;

                    alert(
                        `Para esta quantidade você pode escolher até ${maxSabores} sabor(es).`
                    );
                }

                atualizarLimiteSaboresDocinhos();
                atualizarResumoDocinhos();
            }
        }
    );

    painel.addEventListener(
        "input",
        function(event) {

            if (
                event.target.classList.contains(
                    "quantidade-sabor-docinho"
                )
            ) {
                atualizarLimiteSaboresDocinhos();
                atualizarResumoDocinhos();
            }
        }
    );

    painel.addEventListener(
        "change",
        function(event) {

            const input = event.target;

            if (
                !input.classList.contains(
                    "quantidade-sabor-docinho"
                ) ||
                !ehPacoteDocinhoAtual()
            ) {
                return;
            }

            const minimoPorSabor =
                Number(
                    regraDocinhoAtual
                        ?.quantidade_minima_por_sabor || 0
                );

            const valor =
                Number(input.value || 0);

            // 0 significa que o cliente não escolheu esse sabor.
            // Qualquer valor positivo abaixo do mínimo é corrigido.
            if (
                minimoPorSabor > 0 &&
                valor > 0 &&
                valor < minimoPorSabor
            ) {
                input.value =
                    String(minimoPorSabor);

                alert(
                    `Cada sabor escolhido precisa ter no mínimo ${minimoPorSabor} unidades. ` +
                    `O valor foi ajustado para ${minimoPorSabor}.`
                );
            }

            atualizarLimiteSaboresDocinhos();
            atualizarResumoDocinhos();
        }
    );

    document.getElementById(
        "quantidadeDocinhos"
    )?.addEventListener(
        "input",
        atualizarRegraDocinho
    );
}

async function carregarMontagemDocinhos() {

    const painel =
        document.getElementById(
            "painelDocinhos"
        );

    if (!painel) {
        return;
    }

    try {

        const resultados =
            await Promise.all([
                buscarOpcoesDocinhosSupabase(),
                buscarRegrasDocinhosSupabase()
            ]);

        opcoesDocinhosSupabase =
            resultados[0] || [];

        regrasDocinhosSupabase =
            resultados[1] || [];

        renderizarCategoriasDocinhos();
        configurarEventosDocinhos();
        atualizarResumoDocinhos();

    } catch (erro) {

        console.error(
            "Erro ao carregar docinhos:",
            erro
        );

        const categorias =
            document.getElementById(
                "opcoesCategoriaDocinho"
            );

        if (categorias) {
            categorias.innerHTML = `
                <div class="opcoes-indisponiveis">
                    Não foi possível carregar os docinhos.
                    Atualize a página e tente novamente.
                </div>
            `;
        }
    }
}

function adicionarDocinhosCarrinho() {
    if (!horarioRetiradaValido(document.getElementById("horaRetiradaDocinhos"))) {
        return;
    }

    const campoDataBloqueioAtual = document.getElementById("dataRetiradaDocinhos");
    if (!validarDataRetiradaDisponivel(campoDataBloqueioAtual, true)) {
        return;
    }


    const categoria =
        categoriaDocinhoSelecionada();

    const quantidade =
        Number(
            document.getElementById(
                "quantidadeDocinhos"
            )?.value || 0
        );

    const data =
        document.getElementById(
            "dataRetiradaDocinhos"
        )?.value;

    const horario =
        document.getElementById(
            "horaRetiradaDocinhos"
        )?.value;

    if (!categoria) {
        alert("Escolha a categoria dos docinhos.");
        return;
    }

    if (!quantidade) {
        alert("Informe a quantidade de docinhos.");
        return;
    }

    // Revalida a regra sem renderizar novamente os sabores.
    // Isso preserva as quantidades que o cliente já digitou.
    regraDocinhoAtual =
        encontrarRegraDocinho(
            categoria,
            quantidade
        );

    if (!regraDocinhoAtual) {

        const minimo =
            menorQuantidadeCategoriaDocinho(
                categoria
            );

        alert(
            `A quantidade informada não atende às regras desta categoria. O pedido mínimo atual é ${minimo} unidade(s).`
        );

        return;
    }

    const ehPacote =
        ehPacoteDocinhoAtual();

    let saboresCarrinho = [];

    if (ehPacote) {

        const distribuicao =
            distribuicaoSaboresDocinhosPacote();

        const minimoPorSabor =
            Number(
                regraDocinhoAtual
                    .quantidade_minima_por_sabor || 0
            );

        const maxSabores =
            Number(
                regraDocinhoAtual.max_sabores || 0
            );

        const totalDistribuido =
            distribuicao.reduce(
                (total, item) =>
                    total + item.quantidade,
                0
            );

        if (!distribuicao.length) {
            alert(
                "Informe a quantidade desejada de pelo menos um sabor."
            );
            return;
        }

        const saborAbaixoDoMinimo =
            distribuicao.find(
                item =>
                    minimoPorSabor > 0 &&
                    item.quantidade < minimoPorSabor
            );

        if (saborAbaixoDoMinimo) {
            alert(
                `${saborAbaixoDoMinimo.nome} está com ${saborAbaixoDoMinimo.quantidade} unidade(s). ` +
                `Cada sabor escolhido precisa ter no mínimo ${minimoPorSabor} unidades.`
            );
            saborAbaixoDoMinimo.input?.focus();
            return;
        }

        if (
            maxSabores > 0 &&
            distribuicao.length > maxSabores
        ) {
            alert(
                `Você pode escolher no máximo ${maxSabores} sabor(es) para este pacote.`
            );
            return;
        }

        if (totalDistribuido !== quantidade) {
            alert(
                `A soma dos sabores precisa fechar exatamente ${quantidade} unidades. ` +
                `No momento foram distribuídas ${totalDistribuido}.`
            );
            return;
        }

        saboresCarrinho =
            distribuicao.map(
                item =>
                    `${item.nome} (${item.quantidade})`
            );

    } else {

        const sabores =
            saboresDocinhosSelecionados();

        if (!sabores.length) {
            alert("Escolha pelo menos um sabor.");
            return;
        }

        const maxSabores =
            Number(
                regraDocinhoAtual.max_sabores || 0
            );

        if (
            maxSabores > 0 &&
            sabores.length > maxSabores
        ) {
            alert(
                `Escolha no máximo ${maxSabores} sabor(es).`
            );
            return;
        }

        saboresCarrinho =
            sabores.map(item => item.value);
    }

    if (!data) {
        alert("Escolha a data da retirada.");
        return;
    }

    if (!horario) {
        alert("Escolha o horário da retirada.");
        return;
    }

    const precoUnitario =
        ehPacote
            ? 0
            : Number(
                regraDocinhoAtual.preco_unitario || 0
            );

    const quantidadePacote =
        ehPacote
            ? Number(
                regraDocinhoAtual.quantidade_pacote || 0
            )
            : 0;

    const precoPacote =
        ehPacote
            ? Number(
                regraDocinhoAtual.preco_pacote || 0
            )
            : 0;

    const total =
        ehPacote && quantidadePacote > 0
            ? (quantidade / quantidadePacote) *
              precoPacote
            : quantidade * precoUnitario;

    carrinho.push({
        id: Date.now(),
        tipo: "docinhos",
        nome: `Docinhos ${nomeCategoriaDocinho(categoria)}`,
        categoria: nomeCategoriaDocinho(categoria),
        categoriaId: categoria,
        unidades: quantidade,
        sabores: saboresCarrinho,
        tipoCobranca:
            ehPacote ? "pacote" : "unidade",
        precoUnitario: precoUnitario,
        quantidadePacote: quantidadePacote,
        precoPacote: precoPacote,
        quantidadeMinimaPorSabor:
            ehPacote
                ? Number(
                    regraDocinhoAtual
                        .quantidade_minima_por_sabor || 0
                )
                : 0,
        regraNome: regraDocinhoAtual.nome || "",
        data: data,
        horario: horario,
        preco: total,
        quantidade: 1
    });

    salvarCarrinho();

    alert(
        "Docinhos adicionados ao carrinho!\n\n" +
        (
            ehPacote
                ? `${quantidade} unidades • pacote de ${quantidadePacote} por ${formatarMoeda(precoPacote)}\n`
                : `${quantidade} unidades • ${formatarMoeda(precoUnitario)} cada\n`
        ) +
        `Total: ${formatarMoeda(total)}`
    );
}


document.addEventListener(
    "DOMContentLoaded",
    function () {
        carregarMontagemDocinhos();
    }
);




/* =====================================================
   CUPCAKES - SABORES E REGRAS VINDAS DO SUPABASE
===================================================== */

let opcoesCupcakesSupabase = [];
let regrasCupcakesSupabase = [];
let regraCupcakeAtual = null;

async function buscarOpcoesCupcakesSupabase() {
    const endpoint =
        `${SUPABASE_URL}/rest/v1/opcoes_encomenda` +
        `?tipo_produto=eq.cupcake&ativo=eq.true&select=*` +
        `&order=grupo.asc,ordem.asc,created_at.asc`;

    const resposta = await fetch(endpoint, {
        headers: {
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
        }
    });

    if (!resposta.ok) {
        throw new Error("Não foi possível carregar os sabores de cupcakes.");
    }

    return await resposta.json();
}

async function buscarRegrasCupcakesSupabase() {
    const endpoint =
        `${SUPABASE_URL}/rest/v1/regras_encomenda` +
        `?tipo_produto=eq.cupcake&ativo=eq.true&select=*` +
        `&order=categoria.asc,quantidade_minima.asc,ordem.asc`;

    const resposta = await fetch(endpoint, {
        headers: {
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
        }
    });

    if (!resposta.ok) {
        throw new Error("Não foi possível carregar as regras dos cupcakes.");
    }

    return await resposta.json();
}

function nomeTipoCupcake(categoria) {
    const nomes = {
        tradicional: "Tradicional",
        decorado: "Com topinho e saia"
    };

    return nomes[categoria] || String(categoria || "")
        .replaceAll("_", " ")
        .replace(/\b\w/g, letra => letra.toUpperCase());
}

function tiposCupcakeDisponiveis() {
    const tipos = new Set();

    regrasCupcakesSupabase.forEach(regra => {
        if (regra.categoria) {
            tipos.add(regra.categoria);
        }
    });

    return [...tipos];
}

function menorQuantidadeCupcake(tipo) {
    const valores = regrasCupcakesSupabase
        .filter(regra => regra.categoria === tipo)
        .map(regra => Number(regra.quantidade_minima || 0))
        .filter(valor => valor > 0);

    return valores.length ? Math.min(...valores) : 1;
}

function menorPrecoCupcake(tipo) {
    const valores = regrasCupcakesSupabase
        .filter(regra => regra.categoria === tipo)
        .map(regra => Number(regra.preco_unitario || 0))
        .filter(valor => valor >= 0);

    return valores.length ? Math.min(...valores) : null;
}

function renderizarTiposCupcake() {
    const container = document.getElementById("opcoesTipoCupcake");
    if (!container) return;

    const tipos = tiposCupcakeDisponiveis();

    if (!tipos.length) {
        container.innerHTML = `
            <div class="opcoes-indisponiveis">
                Nenhum tipo de cupcake foi cadastrado ainda.
            </div>
        `;
        return;
    }

    container.innerHTML = "";

    tipos.forEach(tipo => {
        const minimo = menorQuantidadeCupcake(tipo);
        const menorPreco = menorPrecoCupcake(tipo);

        const label = document.createElement("label");
        label.className = "opcao-card";

        label.innerHTML = `
            <input type="radio" name="tipoCupcake" value="${escaparHtmlSite(tipo)}">

            <span>
                <strong>${escaparHtmlSite(nomeTipoCupcake(tipo))}</strong>
                <small>
                    ${
                        menorPreco !== null
                            ? `A partir de ${formatarMoeda(menorPreco)} / unidade`
                            : "Preço conforme regra cadastrada"
                    }
                </small>
                <em>
                    ${
                        minimo > 1
                            ? `Pedido mínimo a partir de ${minimo} unidades`
                            : "Quantidade conforme regra cadastrada"
                    }
                </em>
            </span>
        `;

        container.appendChild(label);
    });
}

function tipoCupcakeSelecionado() {
    return document.querySelector('input[name="tipoCupcake"]:checked')?.value || "";
}

function saboresCupcakeSelecionados() {
    return [...document.querySelectorAll('input[name="saborCupcake"]:checked')];
}

function encontrarRegraCupcake(tipo, quantidade) {
    if (!tipo || !quantidade) return null;

    return regrasCupcakesSupabase
        .filter(regra =>
            regra.categoria === tipo &&
            Number(regra.quantidade_minima || 0) <= quantidade
        )
        .sort(
            (a, b) =>
                Number(b.quantidade_minima || 0) -
                Number(a.quantidade_minima || 0)
        )[0] || null;
}

function proximaRegraCupcake(tipo, quantidade) {
    return regrasCupcakesSupabase
        .filter(regra =>
            regra.categoria === tipo &&
            Number(regra.quantidade_minima || 0) > quantidade
        )
        .sort(
            (a, b) =>
                Number(a.quantidade_minima || 0) -
                Number(b.quantidade_minima || 0)
        )[0] || null;
}

function renderizarSaboresCupcake() {
    const container = document.getElementById("opcoesSaboresCupcake");
    if (!container) return;

    const sabores = opcoesCupcakesSupabase
        .filter(item => item.grupo === "sabor")
        .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));

    if (!sabores.length) {
        container.innerHTML = `
            <div class="opcoes-indisponiveis">
                Nenhum sabor de cupcake foi cadastrado ainda.
            </div>
        `;
        return;
    }

    container.innerHTML = "";

    sabores.forEach(sabor => {
        const label = document.createElement("label");
        label.className = "opcao-card";

        label.innerHTML = `
            <input
                type="checkbox"
                name="saborCupcake"
                value="${escaparHtmlSite(sabor.nome)}"
                data-id="${sabor.id}"
            >

            <span>
                <strong>${escaparHtmlSite(sabor.nome)}</strong>
                <small>Disponível</small>
                ${sabor.descricao ? `<em>${escaparHtmlSite(sabor.descricao)}</em>` : ""}
            </span>
        `;

        container.appendChild(label);
    });

    atualizarLimiteSaboresCupcake();
}

function atualizarCupcake() {
    const tipo = tipoCupcakeSelecionado();
    const quantidade = Number(document.getElementById("quantidadeCupcakes")?.value || 0);
    const feedback = document.getElementById("regraCupcakeFeedback");

    regraCupcakeAtual = encontrarRegraCupcake(tipo, quantidade);

    if (!tipo) {
        if (feedback) {
            feedback.textContent = "Escolha um tipo e informe a quantidade.";
            feedback.className = "regra-docinho-feedback";
        }

        atualizarLimiteSaboresCupcake();
        atualizarResumoCupcakes();
        return;
    }

    if (!quantidade) {
        if (feedback) {
            feedback.textContent = `Pedido mínimo: ${menorQuantidadeCupcake(tipo)} unidades.`;
            feedback.className = "regra-docinho-feedback";
        }

        atualizarLimiteSaboresCupcake();
        atualizarResumoCupcakes();
        return;
    }

    if (!regraCupcakeAtual) {
        const proxima = proximaRegraCupcake(tipo, quantidade);

        if (feedback) {
            feedback.textContent =
                proxima
                    ? `A partir de ${Number(proxima.quantidade_minima)} unidades esta opção fica disponível.`
                    : "A quantidade informada não atende às regras cadastradas.";

            feedback.className = "regra-docinho-feedback erro";
        }

        atualizarLimiteSaboresCupcake();
        atualizarResumoCupcakes();
        return;
    }

    const maxSabores = Number(regraCupcakeAtual.max_sabores || 0);

    if (feedback) {
        feedback.innerHTML = `
            <strong>${formatarMoeda(regraCupcakeAtual.preco_unitario)} por unidade</strong>
            ${maxSabores > 0 ? ` • até ${maxSabores} sabor(es)` : ""}
        `;
        feedback.className = "regra-docinho-feedback sucesso";
    }

    atualizarLimiteSaboresCupcake();
    atualizarResumoCupcakes();
}

function atualizarLimiteSaboresCupcake() {
    const selecionados = saboresCupcakeSelecionados();
    const maxSabores = Number(regraCupcakeAtual?.max_sabores || 0);

    const contador = document.getElementById("quantidadeSaboresCupcake");
    const limite = document.getElementById("limiteSaboresCupcake");
    const ajuda = document.getElementById("ajudaSaboresCupcake");
    const mensagem = document.getElementById("mensagemLimiteSaboresCupcake");

    if (contador) {
        contador.textContent = selecionados.length;
    }

    if (limite) {
        limite.textContent =
            maxSabores > 0
                ? `/${maxSabores} selecionados`
                : " selecionados";
    }

    if (ajuda) {
        ajuda.textContent =
            regraCupcakeAtual && maxSabores > 0
                ? `Você pode escolher até ${maxSabores} sabor(es) para esta quantidade.`
                : "O limite de sabores será definido conforme a quantidade escolhida.";
    }

    if (mensagem) {
        mensagem.textContent =
            maxSabores > 0 && selecionados.length >= maxSabores
                ? `Você já escolheu o limite de ${maxSabores} sabor(es).`
                : "";
    }

    document.querySelectorAll('input[name="saborCupcake"]').forEach(input => {
        input.disabled =
            maxSabores > 0 &&
            selecionados.length >= maxSabores &&
            !input.checked;
    });
}

function atualizarResumoCupcakes() {
    const tipo = tipoCupcakeSelecionado();
    const quantidade = Number(document.getElementById("quantidadeCupcakes")?.value || 0);
    const sabores = saboresCupcakeSelecionados();

    const campoTipo = document.getElementById("resumoTipoCupcake");
    const campoQuantidade = document.getElementById("resumoQuantidadeCupcake");
    const campoSabores = document.getElementById("resumoSaboresCupcake");
    const campoPreco = document.getElementById("resumoPrecoCupcake");
    const campoTotal = document.getElementById("valorTotalCupcakes");

    if (campoTipo) {
        campoTipo.textContent = tipo ? nomeTipoCupcake(tipo) : "—";
    }

    if (campoQuantidade) {
        campoQuantidade.textContent = quantidade ? `${quantidade} unidade(s)` : "—";
    }

    if (campoSabores) {
        campoSabores.textContent =
            sabores.length
                ? sabores.map(item => item.value).join(", ")
                : "—";
    }

    if (campoPreco) {
        campoPreco.textContent =
            regraCupcakeAtual
                ? formatarMoeda(regraCupcakeAtual.preco_unitario)
                : "—";
    }

    const total =
        regraCupcakeAtual
            ? quantidade * Number(regraCupcakeAtual.preco_unitario || 0)
            : 0;

    if (campoTotal) {
        campoTotal.textContent = formatarMoeda(total);
    }
}

function configurarEventosCupcakes() {
    const painel = document.getElementById("painelCupcakes");

    if (!painel || painel.dataset.eventosAtivos === "true") {
        return;
    }

    painel.dataset.eventosAtivos = "true";

    painel.addEventListener("change", function(event) {
        const alvo = event.target;

        if (alvo.name === "tipoCupcake") {
            document.getElementById("quantidadeCupcakes").value = "";
            regraCupcakeAtual = null;

            document.querySelectorAll('input[name="saborCupcake"]').forEach(input => {
                input.checked = false;
                input.disabled = false;
            });

            atualizarCupcake();
        }

        if (alvo.name === "saborCupcake") {
            const maxSabores = Number(regraCupcakeAtual?.max_sabores || 0);
            const selecionados = saboresCupcakeSelecionados();

            if (maxSabores > 0 && selecionados.length > maxSabores) {
                alvo.checked = false;
                alert(`Para esta quantidade você pode escolher até ${maxSabores} sabor(es).`);
            }

            atualizarLimiteSaboresCupcake();
            atualizarResumoCupcakes();
        }
    });

    document.getElementById("quantidadeCupcakes")?.addEventListener(
        "input",
        atualizarCupcake
    );
}

async function carregarCupcakes() {
    const painel = document.getElementById("painelCupcakes");

    if (!painel) {
        return;
    }

    try {
        [opcoesCupcakesSupabase, regrasCupcakesSupabase] = await Promise.all([
            buscarOpcoesCupcakesSupabase(),
            buscarRegrasCupcakesSupabase()
        ]);

        renderizarTiposCupcake();
        renderizarSaboresCupcake();
        configurarEventosCupcakes();
        atualizarResumoCupcakes();

    } catch (erro) {
        console.error("Erro ao carregar cupcakes:", erro);

        const tipos = document.getElementById("opcoesTipoCupcake");
        const sabores = document.getElementById("opcoesSaboresCupcake");

        if (tipos) {
            tipos.innerHTML = `
                <div class="opcoes-indisponiveis">
                    Não foi possível carregar os tipos de cupcake.
                </div>
            `;
        }

        if (sabores) {
            sabores.innerHTML = `
                <div class="opcoes-indisponiveis">
                    Não foi possível carregar os sabores de cupcake.
                </div>
            `;
        }
    }
}

function adicionarCupcakesCarrinho() {
    if (!horarioRetiradaValido(document.getElementById("horaRetiradaCupcakes"))) {
        return;
    }

    const campoDataBloqueioAtual = document.getElementById("dataRetiradaCupcakes");
    if (!validarDataRetiradaDisponivel(campoDataBloqueioAtual, true)) {
        return;
    }

    const tipo = tipoCupcakeSelecionado();
    const quantidade = Number(document.getElementById("quantidadeCupcakes")?.value || 0);
    const sabores = saboresCupcakeSelecionados();
    const data = document.getElementById("dataRetiradaCupcakes")?.value;
    const horario = document.getElementById("horaRetiradaCupcakes")?.value;

    if (!tipo) {
        alert("Escolha o tipo de cupcake.");
        return;
    }

    if (!quantidade) {
        alert("Informe a quantidade de cupcakes.");
        return;
    }

    regraCupcakeAtual = encontrarRegraCupcake(tipo, quantidade);

    if (!regraCupcakeAtual) {
        alert(`A quantidade mínima atual é ${menorQuantidadeCupcake(tipo)} unidade(s).`);
        return;
    }

    if (!sabores.length) {
        alert("Escolha pelo menos um sabor.");
        return;
    }

    const maxSabores = Number(regraCupcakeAtual.max_sabores || 0);

    if (maxSabores > 0 && sabores.length > maxSabores) {
        alert(`Escolha no máximo ${maxSabores} sabor(es).`);
        return;
    }

    if (!data) {
        alert("Escolha a data da retirada.");
        return;
    }

    if (!horario) {
        alert("Escolha o horário da retirada.");
        return;
    }

    const precoUnitario = Number(regraCupcakeAtual.preco_unitario || 0);
    const total = quantidade * precoUnitario;

    carrinho.push({
        id: Date.now(),
        tipo: "cupcakes",
        nome: `Cupcakes ${nomeTipoCupcake(tipo)}`,
        tipoCupcake: tipo,
        tipoNome: nomeTipoCupcake(tipo),
        unidades: quantidade,
        sabores: sabores.map(item => item.value),
        precoUnitario: precoUnitario,
        regraNome: regraCupcakeAtual.nome || "",
        data: data,
        horario: horario,
        preco: total,
        quantidade: 1
    });

    salvarCarrinho();

    alert(
        "Cupcakes adicionados ao carrinho!\n\n" +
        `${quantidade} unidade(s) • ${formatarMoeda(precoUnitario)} cada\n` +
        `Total: ${formatarMoeda(total)}`
    );
}

document.addEventListener(
    "DOMContentLoaded",
    carregarCupcakes
);


/* =====================================================
   BOLOS CASEIRINHOS - OPÇÕES VINDAS DO SUPABASE
===================================================== */

let opcoesCaseirinhosSupabase = [];

async function buscarOpcoesCaseirinhosSupabase() {

    const endpoint =
        `${SUPABASE_URL}/rest/v1/opcoes_encomenda` +
        `?tipo_produto=eq.caseirinho&ativo=eq.true&select=*` +
        `&order=grupo.asc,ordem.asc,created_at.asc`;

    const resposta = await fetch(endpoint, {
        headers: {
            "apikey": SUPABASE_PUBLISHABLE_KEY,
            "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
        }
    });

    if (!resposta.ok) {
        throw new Error("Não foi possível carregar os bolos caseirinhos.");
    }

    return await resposta.json();
}

function criarOpcaoCaseirinho(opcao, nomeInput) {

    const label =
        document.createElement("label");

    label.className = "opcao-card";

    const preco =
        Number(opcao.preco || 0);

    let textoPreco = "";

    if (opcao.grupo === "tamanho") {
        textoPreco =
            formatarMoeda(preco);
    } else if (preco > 0) {
        textoPreco =
            `+ ${formatarMoeda(preco)}`;
    } else {
        textoPreco =
            "Disponível";
    }

    label.innerHTML = `
        <input
            type="radio"
            name="${nomeInput}"
            value="${escaparHtmlSite(opcao.nome)}"
            data-preco="${preco}"
            data-id="${opcao.id}"
        >

        <span>
            <strong>${escaparHtmlSite(opcao.nome)}</strong>
            <small>${textoPreco}</small>
            ${
                opcao.descricao
                    ? `<em>${escaparHtmlSite(opcao.descricao)}</em>`
                    : ""
            }
        </span>
    `;

    return label;
}

function renderizarGrupoCaseirinho(grupo, idContainer, nomeInput) {

    const container =
        document.getElementById(idContainer);

    if (!container) {
        return;
    }

    const itens =
        opcoesCaseirinhosSupabase
            .filter(item => item.grupo === grupo)
            .sort(
                (a, b) =>
                    Number(a.ordem || 0) -
                    Number(b.ordem || 0)
            );

    if (!itens.length) {

        container.innerHTML = `
            <div class="opcoes-indisponiveis">
                Nenhuma opção disponível no momento.
            </div>
        `;

        return;
    }

    container.innerHTML = "";

    itens.forEach(item => {
        container.appendChild(
            criarOpcaoCaseirinho(item, nomeInput)
        );
    });
}

function atualizarResumoCaseirinho() {

    const sabor =
        document.querySelector(
            'input[name="saborCaseirinho"]:checked'
        );

    const tamanho =
        document.querySelector(
            'input[name="tamanhoCaseirinho"]:checked'
        );

    const precoSabor =
        sabor
            ? Number(sabor.dataset.preco || 0)
            : 0;

    const precoTamanho =
        tamanho
            ? Number(tamanho.dataset.preco || 0)
            : 0;

    const total =
        precoSabor + precoTamanho;

    const resumoSabor =
        document.getElementById("resumoSaborCaseirinho");

    const resumoTamanho =
        document.getElementById("resumoTamanhoCaseirinho");

    const resumoTotal =
        document.getElementById("valorTotalCaseirinho");

    if (resumoSabor) {
        resumoSabor.textContent =
            sabor ? sabor.value : "—";
    }

    if (resumoTamanho) {
        resumoTamanho.textContent =
            tamanho ? tamanho.value : "—";
    }

    if (resumoTotal) {
        resumoTotal.textContent =
            formatarMoeda(total);
    }
}

function configurarEventosCaseirinhos() {

    const painel =
        document.getElementById("painelCaseirinhos");

    if (!painel || painel.dataset.eventosAtivos === "true") {
        return;
    }

    painel.dataset.eventosAtivos = "true";

    painel.addEventListener("change", function(event) {

        if (
            event.target.name === "saborCaseirinho" ||
            event.target.name === "tamanhoCaseirinho"
        ) {
            atualizarResumoCaseirinho();
        }
    });
}

async function carregarMontagemCaseirinhos() {

    if (!document.getElementById("painelCaseirinhos")) {
        return;
    }

    try {

        opcoesCaseirinhosSupabase =
            await buscarOpcoesCaseirinhosSupabase();

        renderizarGrupoCaseirinho(
            "sabor",
            "opcoesSaborCaseirinho",
            "saborCaseirinho"
        );

        renderizarGrupoCaseirinho(
            "tamanho",
            "opcoesTamanhoCaseirinho",
            "tamanhoCaseirinho"
        );

        configurarEventosCaseirinhos();
        atualizarResumoCaseirinho();

    } catch (erro) {

        console.error(
            "Erro ao carregar bolos caseirinhos:",
            erro
        );

        [
            "opcoesSaborCaseirinho",
            "opcoesTamanhoCaseirinho"
        ].forEach(id => {

            const container =
                document.getElementById(id);

            if (container) {
                container.innerHTML = `
                    <div class="opcoes-indisponiveis">
                        Não foi possível carregar as opções.
                        Atualize a página e tente novamente.
                    </div>
                `;
            }
        });
    }
}

function adicionarCaseirinhoCarrinho() {
    if (!horarioRetiradaValido(document.getElementById("horaRetiradaCaseirinho"))) {
        return;
    }

    const campoDataBloqueioAtual = document.getElementById("dataRetiradaCaseirinho");
    if (!validarDataRetiradaDisponivel(campoDataBloqueioAtual, true)) {
        return;
    }


    const sabor =
        document.querySelector(
            'input[name="saborCaseirinho"]:checked'
        );

    const tamanho =
        document.querySelector(
            'input[name="tamanhoCaseirinho"]:checked'
        );

    const data =
        document.getElementById("dataRetiradaCaseirinho")?.value;

    const horario =
        document.getElementById("horaRetiradaCaseirinho")?.value;

    if (!sabor) {
        alert("Escolha o sabor do bolo caseirinho.");
        return;
    }

    if (!tamanho) {
        alert("Escolha o tamanho do bolo caseirinho.");
        return;
    }

    if (!data) {
        alert("Escolha a data da retirada.");
        return;
    }

    if (!horario) {
        alert("Escolha o horário da retirada.");
        return;
    }

    const precoSabor =
        Number(sabor.dataset.preco || 0);

    const precoTamanho =
        Number(tamanho.dataset.preco || 0);

    const total =
        precoSabor + precoTamanho;

    carrinho.push({
        id: Date.now(),
        tipo: "caseirinho",
        nome: "Bolo caseirinho",
        sabor: sabor.value,
        tamanho: tamanho.value,
        data: data,
        horario: horario,
        preco: total,
        quantidade: 1
    });

    salvarCarrinho();

    alert(
        "Bolo caseirinho adicionado ao carrinho!\n\n" +
        `${sabor.value} • ${tamanho.value}\n` +
        `Total: ${formatarMoeda(total)}`
    );
}


document.addEventListener(
    "DOMContentLoaded",
    function () {
        carregarMontagemCaseirinhos();
    }
);





/* =====================================================
   KIT FESTA - OPÇÕES VINDAS DO SUPABASE
===================================================== */

let kitsFestaSupabase = [];
let saboresKitFestaSupabase = [];
let kitFestaSelecionado = null;
let kitFestaCarregado = false;


async function buscarKitsFestaSupabase() {

    const endpoint =
        `${SUPABASE_URL}/rest/v1/vw_kits_festa_ativos` +
        `?select=*&order=ordem.asc,id.asc`;

    const resposta = await fetch(
        endpoint,
        {
            headers: {
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
            }
        }
    );

    if (!resposta.ok) {
        throw new Error("Não foi possível carregar os Kits Festa.");
    }

    return await resposta.json();
}


async function buscarSaboresKitFestaSupabase(kitId) {

    const endpoint =
        `${SUPABASE_URL}/rest/v1/vw_kit_festa_sabores_ativos` +
        `?kit_id=eq.${encodeURIComponent(kitId)}` +
        `&select=*&order=categoria.asc,ordem.asc,nome.asc`;

    const resposta = await fetch(
        endpoint,
        {
            headers: {
                "apikey": SUPABASE_PUBLISHABLE_KEY,
                "Authorization": `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
            }
        }
    );

    if (!resposta.ok) {
        throw new Error("Não foi possível carregar os sabores do Kit Festa.");
    }

    return await resposta.json();
}


function composicaoTextoKit(kit) {

    if (!kit) {
        return "—";
    }

    return (
        `1 bolo de ${Number(kit.fatias_bolo || 0)} fatias • ` +
        `${Number(kit.quantidade_cupcakes || 0)} cupcakes • ` +
        `${Number(kit.quantidade_docinhos || 0)} docinhos`
    );
}


function renderizarKitsFesta() {

    const container =
        document.getElementById("opcoesKitFesta");

    if (!container) {
        return;
    }

    if (kitsFestaSupabase.length === 0) {
        container.innerHTML = `
            <div class="opcoes-indisponiveis">
                Nenhum Kit Festa está disponível no momento.
            </div>
        `;
        return;
    }

    container.innerHTML = "";

    kitsFestaSupabase.forEach(function(kit) {

        const label =
            document.createElement("label");

        label.className =
            "opcao-card kit-opcao-card";

        const temAvista =
            kit.preco_avista !== null &&
            kit.preco_avista !== undefined &&
            Number(kit.preco_avista) > 0;

        label.innerHTML = `
            <input
                type="radio"
                name="kitFesta"
                value="${escaparHtmlSite(kit.nome)}"
                data-id="${kit.id}"
            >

            <span>
                <strong>${escaparHtmlSite(kit.nome)}</strong>

                <div class="kit-composicao">
                    <span>🎂 1 bolo de ${Number(kit.fatias_bolo || 0)} fatias</span>
                    <span>🧁 ${Number(kit.quantidade_cupcakes || 0)} cupcakes</span>
                    <span>🍬 ${Number(kit.quantidade_docinhos || 0)} docinhos</span>
                </div>

                <div class="kit-precos">
                    <b>${formatarMoeda(kit.preco)}</b>
                    ${
                        temAvista
                            ? `<em>À vista: ${formatarMoeda(kit.preco_avista)}</em>`
                            : ""
                    }
                </div>
            </span>
        `;

        container.appendChild(label);
    });
}


function saboresSelecionadosKit(categoria) {

    return [
        ...document.querySelectorAll(
            `input[name="saborKit_${categoria}"]:checked`
        )
    ];
}


function limiteSaboresKit(categoria) {

    if (!kitFestaSelecionado) {
        return 0;
    }

    if (categoria === "bolo") {
        return Number(
            kitFestaSelecionado.max_sabores_bolo || 0
        );
    }

    if (categoria === "docinho") {
        return Number(
            kitFestaSelecionado.max_sabores_docinhos || 0
        );
    }

    if (categoria === "cupcake") {
        return Number(
            kitFestaSelecionado.max_sabores_cupcakes || 0
        );
    }

    return 0;
}


function criarOpcaoSaborKit(sabor, categoria, limite) {

    const label =
        document.createElement("label");

    label.className =
        "opcao-card";

    const tipoInput =
        limite === 1
            ? "radio"
            : "checkbox";

    label.innerHTML = `
        <input
            type="${tipoInput}"
            name="saborKit_${categoria}"
            value="${escaparHtmlSite(sabor.nome)}"
            data-id="${sabor.sabor_id}"
        >

        <span>
            <strong>${escaparHtmlSite(sabor.nome)}</strong>
            ${
                sabor.descricao
                    ? `<small>${escaparHtmlSite(sabor.descricao)}</small>`
                    : ""
            }
        </span>
    `;

    return label;
}


function renderizarSaboresCategoriaKit(
    categoria,
    idContainer,
    idContador,
    idLimite,
    idAjuda,
    idMensagem
) {

    const container =
        document.getElementById(idContainer);

    if (!container) {
        return;
    }

    const sabores =
        saboresKitFestaSupabase.filter(
            item => item.categoria === categoria
        );

    const limite =
        limiteSaboresKit(categoria);

    const contador =
        document.getElementById(idContador);

    const textoLimite =
        document.getElementById(idLimite);

    const ajuda =
        document.getElementById(idAjuda);

    const mensagem =
        document.getElementById(idMensagem);

    if (contador) {
        contador.textContent = "0";
    }

    if (textoLimite) {
        textoLimite.textContent =
            limite > 0
                ? `/${limite} selecionados`
                : " selecionados";
    }

    if (ajuda) {
        ajuda.textContent =
            limite > 0
                ? (
                    limite === 1
                        ? "Escolha 1 sabor."
                        : `Escolha até ${limite} sabores.`
                )
                : "Escolha entre os sabores disponíveis.";
    }

    if (mensagem) {
        mensagem.textContent = "";
    }

    if (sabores.length === 0) {

        container.innerHTML = `
            <div class="opcoes-indisponiveis">
                Nenhum sabor cadastrado nesta categoria.
            </div>
        `;

        return;
    }

    container.innerHTML = "";

    sabores.forEach(function(sabor) {
        container.appendChild(
            criarOpcaoSaborKit(
                sabor,
                categoria,
                limite
            )
        );
    });
}


function atualizarEstadoSaboresKit(categoria) {

    const selecionados =
        saboresSelecionadosKit(categoria);

    const limite =
        limiteSaboresKit(categoria);

    const mapa = {
        bolo: {
            contador: "quantidadeSaboresBoloKit",
            mensagem: "mensagemSaboresBoloKit"
        },
        docinho: {
            contador: "quantidadeSaboresDocinhosKit",
            mensagem: "mensagemSaboresDocinhosKit"
        },
        cupcake: {
            contador: "quantidadeSaboresCupcakesKit",
            mensagem: "mensagemSaboresCupcakesKit"
        }
    };

    const config = mapa[categoria];

    if (!config) {
        return;
    }

    const contador =
        document.getElementById(config.contador);

    const mensagem =
        document.getElementById(config.mensagem);

    if (contador) {
        contador.textContent =
            selecionados.length;
    }

    const inputs =
        document.querySelectorAll(
            `input[name="saborKit_${categoria}"]`
        );

    if (limite > 1) {

        inputs.forEach(function(input) {
            input.disabled =
                selecionados.length >= limite &&
                !input.checked;
        });

        if (mensagem) {
            mensagem.textContent =
                selecionados.length >= limite
                    ? `Você já escolheu os ${limite} sabores permitidos.`
                    : "";
        }

    } else {

        inputs.forEach(function(input) {
            input.disabled = false;
        });

        if (mensagem) {
            mensagem.textContent = "";
        }
    }
}


function renderizarPagamentoKit() {

    const container =
        document.getElementById(
            "opcoesPagamentoKit"
        );

    if (!container) {
        return;
    }

    if (!kitFestaSelecionado) {

        container.innerHTML = `
            <div class="opcoes-indisponiveis">
                Escolha primeiro um Kit Festa.
            </div>
        `;

        return;
    }

    const precoNormal =
        Number(
            kitFestaSelecionado.preco || 0
        );

    const precoAvista =
        Number(
            kitFestaSelecionado.preco_avista || 0
        );

    container.innerHTML = `
        <label class="opcao-card">
            <input
                type="radio"
                name="pagamentoKitFesta"
                value="Valor normal"
                data-preco="${precoNormal}"
            >
            <span>
                <strong>Valor do kit</strong>
                <small>${formatarMoeda(precoNormal)}</small>
            </span>
        </label>

        ${
            precoAvista > 0
                ? `
                    <label class="opcao-card">
                        <input
                            type="radio"
                            name="pagamentoKitFesta"
                            value="Pagamento à vista"
                            data-preco="${precoAvista}"
                        >
                        <span>
                            <strong>Pagamento à vista</strong>
                            <small>${formatarMoeda(precoAvista)}</small>
                        </span>
                    </label>
                `
                : ""
        }
    `;
}


function renumerarEtapasKitFesta() {

    const etapas =
        document.querySelectorAll(
            "#painelKitFesta .opcoes-bolo .etapa-bolo"
        );

    let numero = 1;

    etapas.forEach(function(etapa) {

        const oculta =
            etapa.hidden ||
            getComputedStyle(etapa).display === "none";

        if (oculta) {
            return;
        }

        const marcador =
            etapa.querySelector(
                ".numero-etapa"
            );

        if (marcador) {
            marcador.textContent =
                numero;
        }

        numero++;
    });
}


function atualizarResumoKitFesta() {

    const resumoNome =
        document.getElementById(
            "resumoNomeKitFesta"
        );

    const resumoComposicao =
        document.getElementById(
            "resumoComposicaoKitFesta"
        );

    const resumoBolo =
        document.getElementById(
            "resumoSaborBoloKit"
        );

    const resumoDocinhos =
        document.getElementById(
            "resumoSaboresDocinhosKit"
        );

    const resumoCupcakes =
        document.getElementById(
            "resumoSaboresCupcakesKit"
        );

    const linhaCupcakes =
        document.getElementById(
            "linhaResumoCupcakesKit"
        );

    const resumoPagamento =
        document.getElementById(
            "resumoPagamentoKitFesta"
        );

    const campoTotal =
        document.getElementById(
            "valorTotalKitFesta"
        );

    const textoAvista =
        document.getElementById(
            "textoValorAvistaKit"
        );

    const saboresBolo =
        saboresSelecionadosKit("bolo");

    const saboresDocinhos =
        saboresSelecionadosKit("docinho");

    const saboresCupcakes =
        saboresSelecionadosKit("cupcake");

    const pagamento =
        document.querySelector(
            'input[name="pagamentoKitFesta"]:checked'
        );

    if (resumoNome) {
        resumoNome.textContent =
            kitFestaSelecionado
                ? kitFestaSelecionado.nome
                : "—";
    }

    if (resumoComposicao) {
        resumoComposicao.textContent =
            kitFestaSelecionado
                ? composicaoTextoKit(
                    kitFestaSelecionado
                )
                : "Escolha um kit para visualizar.";
    }

    if (resumoBolo) {
        resumoBolo.textContent =
            saboresBolo.length
                ? saboresBolo
                    .map(item => item.value)
                    .join(", ")
                : "—";
    }

    if (resumoDocinhos) {
        resumoDocinhos.textContent =
            saboresDocinhos.length
                ? saboresDocinhos
                    .map(item => item.value)
                    .join(", ")
                : "—";
    }

    const temSaboresCupcake =
        saboresKitFestaSupabase.some(
            item => item.categoria === "cupcake"
        );

    if (linhaCupcakes) {
        linhaCupcakes.hidden =
            !temSaboresCupcake;
    }

    if (resumoCupcakes) {
        resumoCupcakes.textContent =
            saboresCupcakes.length
                ? saboresCupcakes
                    .map(item => item.value)
                    .join(", ")
                : "—";
    }

    if (resumoPagamento) {
        resumoPagamento.textContent =
            pagamento
                ? pagamento.value
                : "—";
    }

    const total =
        pagamento
            ? Number(
                pagamento.dataset.preco || 0
            )
            : 0;

    if (campoTotal) {
        campoTotal.textContent =
            formatarMoeda(total);
    }

    if (textoAvista) {

        const precoAvista =
            Number(
                kitFestaSelecionado
                    ?.preco_avista || 0
            );

        textoAvista.hidden =
            !kitFestaSelecionado ||
            precoAvista <= 0;

        if (!textoAvista.hidden) {
            textoAvista.textContent =
                `Valor especial à vista disponível: ${formatarMoeda(precoAvista)}`;
        }
    }
}


async function selecionarKitFesta(id) {

    kitFestaSelecionado =
        kitsFestaSupabase.find(
            item => Number(item.id) === Number(id)
        ) || null;

    saboresKitFestaSupabase = [];

    [
        "opcoesSaboresBoloKit",
        "opcoesSaboresDocinhosKit",
        "opcoesSaboresCupcakesKit"
    ].forEach(function(idContainer) {

        const container =
            document.getElementById(idContainer);

        if (container) {
            container.innerHTML =
                '<p class="opcoes-carregando">Carregando sabores...</p>';
        }
    });

    renderizarPagamentoKit();
    atualizarResumoKitFesta();

    if (!kitFestaSelecionado) {
        return;
    }

    try {

        saboresKitFestaSupabase =
            await buscarSaboresKitFestaSupabase(
                kitFestaSelecionado.id
            );

        renderizarSaboresCategoriaKit(
            "bolo",
            "opcoesSaboresBoloKit",
            "quantidadeSaboresBoloKit",
            "limiteSaboresBoloKit",
            "ajudaSaborBoloKit",
            "mensagemSaboresBoloKit"
        );

        renderizarSaboresCategoriaKit(
            "docinho",
            "opcoesSaboresDocinhosKit",
            "quantidadeSaboresDocinhosKit",
            "limiteSaboresDocinhosKit",
            "ajudaSaboresDocinhosKit",
            "mensagemSaboresDocinhosKit"
        );

        const saboresCupcake =
            saboresKitFestaSupabase.filter(
                item => item.categoria === "cupcake"
            );

        const etapaCupcakes =
            document.getElementById(
                "etapaSaboresCupcakesKit"
            );

        if (etapaCupcakes) {
            etapaCupcakes.hidden =
                saboresCupcake.length === 0;
        }

        if (saboresCupcake.length > 0) {

            renderizarSaboresCategoriaKit(
                "cupcake",
                "opcoesSaboresCupcakesKit",
                "quantidadeSaboresCupcakesKit",
                "limiteSaboresCupcakesKit",
                "ajudaSaboresCupcakesKit",
                "mensagemSaboresCupcakesKit"
            );
        }

        renumerarEtapasKitFesta();
        atualizarResumoKitFesta();

    } catch (erro) {

        console.error(
            "Erro ao carregar sabores do Kit Festa:",
            erro
        );

        [
            "opcoesSaboresBoloKit",
            "opcoesSaboresDocinhosKit"
        ].forEach(function(idContainer) {

            const container =
                document.getElementById(idContainer);

            if (container) {
                container.innerHTML = `
                    <div class="opcoes-indisponiveis">
                        Não foi possível carregar os sabores.
                    </div>
                `;
            }
        });
    }
}


function configurarEventosKitFesta() {

    const painel =
        document.getElementById(
            "painelKitFesta"
        );

    if (!painel) {
        return;
    }

    painel.addEventListener(
        "change",
        async function(event) {

            const input =
                event.target.closest(
                    'input[type="radio"], input[type="checkbox"]'
                );

            if (!input) {
                return;
            }

            if (input.name === "kitFesta") {
                await selecionarKitFesta(
                    input.dataset.id
                );
                return;
            }

            if (
                input.name === "saborKit_bolo" ||
                input.name === "saborKit_docinho" ||
                input.name === "saborKit_cupcake"
            ) {

                const categoria =
                    input.name.replace(
                        "saborKit_",
                        ""
                    );

                const limite =
                    limiteSaboresKit(
                        categoria
                    );

                const selecionados =
                    saboresSelecionadosKit(
                        categoria
                    );

                if (
                    limite > 1 &&
                    selecionados.length > limite
                ) {
                    input.checked = false;

                    alert(
                        `Você pode escolher no máximo ${limite} sabores.`
                    );
                }

                atualizarEstadoSaboresKit(
                    categoria
                );
            }

            atualizarResumoKitFesta();
        }
    );
}


async function carregarKitFestaCliente() {

    const painel =
        document.getElementById(
            "painelKitFesta"
        );

    if (!painel || kitFestaCarregado) {
        return;
    }

    try {

        kitsFestaSupabase =
            await buscarKitsFestaSupabase();

        renderizarKitsFesta();
        configurarEventosKitFesta();

        kitFestaCarregado = true;

    } catch (erro) {

        console.error(
            "Erro ao carregar Kit Festa:",
            erro
        );

        const container =
            document.getElementById(
                "opcoesKitFesta"
            );

        if (container) {
            container.innerHTML = `
                <div class="opcoes-indisponiveis">
                    Não foi possível carregar os Kits Festa.
                    Atualize a página e tente novamente.
                </div>
            `;
        }
    }
}


function validarSelecaoSaboresKit(
    categoria,
    nomeExibicao
) {

    const disponiveis =
        saboresKitFestaSupabase.filter(
            item => item.categoria === categoria
        );

    if (disponiveis.length === 0) {
        return true;
    }

    const selecionados =
        saboresSelecionadosKit(
            categoria
        );

    if (selecionados.length === 0) {
        alert(
            `Escolha pelo menos 1 sabor para ${nomeExibicao}.`
        );
        return false;
    }

    const limite =
        limiteSaboresKit(
            categoria
        );

    if (
        limite > 0 &&
        selecionados.length > limite
    ) {
        alert(
            `Escolha no máximo ${limite} sabor(es) para ${nomeExibicao}.`
        );
        return false;
    }

    return true;
}


function adicionarKitFestaCarrinho() {
    if (!horarioRetiradaValido(document.getElementById("horaRetiradaKitFesta"))) {
        return;
    }

    const campoDataBloqueioAtual = document.getElementById("dataRetiradaKitFesta");
    if (!validarDataRetiradaDisponivel(campoDataBloqueioAtual, true)) {
        return;
    }


    if (!kitFestaSelecionado) {
        alert("Escolha um Kit Festa.");
        return;
    }

    if (
        !validarSelecaoSaboresKit(
            "bolo",
            "o recheio do bolo"
        )
    ) {
        return;
    }

    if (
        !validarSelecaoSaboresKit(
            "docinho",
            "os docinhos"
        )
    ) {
        return;
    }

    if (
        !validarSelecaoSaboresKit(
            "cupcake",
            "os cupcakes"
        )
    ) {
        return;
    }

    const pagamento =
        document.querySelector(
            'input[name="pagamentoKitFesta"]:checked'
        );

    if (!pagamento) {
        alert(
            "Escolha a condição de pagamento do Kit Festa."
        );
        return;
    }

    const data =
        document.getElementById(
            "dataRetiradaKitFesta"
        )?.value;

    const horario =
        document.getElementById(
            "horaRetiradaKitFesta"
        )?.value;

    if (!data) {
        alert("Escolha a data da retirada.");
        return;
    }

    if (!horario) {
        alert("Escolha o horário da retirada.");
        return;
    }

    const saboresBolo =
        saboresSelecionadosKit("bolo")
            .map(item => item.value);

    const saboresDocinhos =
        saboresSelecionadosKit("docinho")
            .map(item => item.value);

    const saboresCupcakes =
        saboresSelecionadosKit("cupcake")
            .map(item => item.value);

    const precoEscolhido =
        Number(
            pagamento.dataset.preco || 0
        );

    const item = {

        id: Date.now(),

        tipo: "kit-festa",

        kitId:
            Number(
                kitFestaSelecionado.id
            ),

        nome:
            kitFestaSelecionado.nome,

        composicao:
            composicaoTextoKit(
                kitFestaSelecionado
            ),

        fatiasBolo:
            Number(
                kitFestaSelecionado.fatias_bolo || 0
            ),

        cupcakes:
            Number(
                kitFestaSelecionado.quantidade_cupcakes || 0
            ),

        docinhos:
            Number(
                kitFestaSelecionado.quantidade_docinhos || 0
            ),

        recheiosBolo:
            saboresBolo,

        saboresDocinhos:
            saboresDocinhos,

        saboresCupcakes:
            saboresCupcakes,

        formaPagamento:
            pagamento.value,

        precoNormal:
            Number(
                kitFestaSelecionado.preco || 0
            ),

        precoAvista:
            kitFestaSelecionado.preco_avista !== null
                ? Number(
                    kitFestaSelecionado.preco_avista || 0
                )
                : null,

        data:
            data,

        horario:
            horario,

        preco:
            precoEscolhido,

        quantidade:
            1
    };

    carrinho.push(item);

    salvarCarrinho();

    alert(
        "Kit Festa adicionado ao carrinho!\n\n" +
        `${item.nome}\n` +
        `Total: ${formatarMoeda(item.preco)}`
    );
}





document.addEventListener(
    "DOMContentLoaded",
    function () {

        const painelKit =
            document.getElementById(
                "painelKitFesta"
            );

        if (!painelKit) {
            return;
        }

        /* O carregamento é antecipado para a troca de aba ficar instantânea. */
        carregarKitFestaCliente();

    }
);


/* =====================================================
   CENTRAL DE ENCOMENDAS
===================================================== */


/* =====================================================
   PERSISTÊNCIA DA ÚLTIMA CATEGORIA DE ENCOMENDA
   Funciona no desktop e no mobile.
===================================================== */

const CHAVE_TIPO_ENCOMENDA_ATUAL =
    "goreteFestasTipoEncomendaAtual";

const TIPOS_ENCOMENDA_VALIDOS = [
    "bolo",
    "docinhos",
    "cupcakes",
    "caseirinhos",
    "kit-festa"
];

function salvarTipoEncomendaAtual(tipo) {
    if (!TIPOS_ENCOMENDA_VALIDOS.includes(tipo)) {
        return;
    }

    localStorage.setItem(
        CHAVE_TIPO_ENCOMENDA_ATUAL,
        tipo
    );
}

function obterTipoEncomendaSalvo() {
    const salvo =
        localStorage.getItem(
            CHAVE_TIPO_ENCOMENDA_ATUAL
        );

    return TIPOS_ENCOMENDA_VALIDOS.includes(salvo)
        ? salvo
        : "bolo";
}

function selecionarTipoEncomenda(tipo) {

    salvarTipoEncomendaAtual(tipo);


    const painelBolo =
        document.getElementById("painelBolo");

    const painelDocinhos =
        document.getElementById("painelDocinhos");

    const painelCupcakes =
        document.getElementById("painelCupcakes");

    const painelCaseirinhos =
        document.getElementById("painelCaseirinhos");

    const painelKitFesta =
        document.getElementById("painelKitFesta");

    const aviso =
        document.getElementById("avisoEncomenda");

    const cards =
        document.querySelectorAll(
            ".card-tipo-encomenda"
        );

    cards.forEach(card => {
        card.classList.toggle(
            "ativo",
            card.dataset.encomenda === tipo
        );
    });

    if (painelBolo) {
        painelBolo.hidden =
            tipo !== "bolo";
    }

    if (painelDocinhos) {
        painelDocinhos.hidden =
            tipo !== "docinhos";
    }

    if (painelCupcakes) {
        painelCupcakes.hidden =
            tipo !== "cupcakes";
    }

    if (painelCaseirinhos) {
        painelCaseirinhos.hidden =
            tipo !== "caseirinhos";
    }

    if (painelKitFesta) {
        painelKitFesta.hidden =
            tipo !== "kit-festa";
    }

    if (aviso) {
        aviso.hidden = true;
    }

    if (tipo === "docinhos") {
        atualizarRegraDocinho();
        atualizarResumoDocinhos();
    }

    if (tipo === "cupcakes") {
        atualizarCupcake();
        atualizarResumoCupcakes();
    }

    if (tipo === "caseirinhos") {
        atualizarResumoCaseirinho();
    }

    if (tipo === "kit-festa") {
        carregarKitFestaCliente();
        atualizarResumoKitFesta();
    }
}


/* Mantém bolo personalizado como opção inicial */

document.addEventListener(
    "DOMContentLoaded",
    function () {

        const seletor =
            document.querySelector(
                ".seletor-encomenda"
            );

        if (!seletor) {
            return;
        }

        selecionarTipoEncomenda(obterTipoEncomendaSalvo());

    }
);
