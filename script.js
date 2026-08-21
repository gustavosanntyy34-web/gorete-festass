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
    categoria = "Produto"
) {

    const itemExistente =
        carrinho.find(
            item =>
                item.tipo === "produto" &&
                item.nome === nome
        );


    if (itemExistente) {

        itemExistente.quantidade++;

    } else {

        carrinho.push({

            id: Date.now(),

            tipo: "produto",

            nome: nome,

            categoria: categoria,

            preco: Number(preco),

            quantidade: 1

        });

    }


    salvarCarrinho();

}


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

        resumoAdicionais.textContent =
            adicionais.length
                ? adicionais
                    .map(item => item.value)
                    .join(", ")
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


    let valorTotal =
        Number(
            tamanho.dataset.preco || 0
        ) +
        Number(
            massa.dataset.preco || 0
        );

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
                    Escolha suas fatias ou monte um bolo
                    personalizado.
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


        /* PRODUTO / FATIA */

        else {

            elemento.innerHTML = `

                <div>

                    <h3>
                        🍰 ${item.nome}
                    </h3>

                    <div class="detalhes-item">

                        <p>
                            <strong>Categoria:</strong>
                            ${item.categoria}
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


    item.quantidade += alteracao;


    if (item.quantidade <= 0) {

        removerItemCarrinho(id);

        return;

    }


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
                        🍰 ${item.nome}
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

function finalizarPedidoWhatsApp() {

    if (carrinho.length === 0) {

        alert("Seu carrinho está vazio.");

        return;

    }


    const nome =
        document
            .getElementById("nomeCliente")
            ?.value
            .trim();


    const telefone =
        document
            .getElementById("telefoneCliente")
            ?.value
            .trim();


    const observacao =
        document
            .getElementById("observacaoPedido")
            ?.value
            .trim();


    if (!nome) {

        alert("Informe seu nome.");

        document
            .getElementById("nomeCliente")
            ?.focus();

        return;

    }


    if (!telefone) {

        alert("Informe seu WhatsApp.");

        document
            .getElementById("telefoneCliente")
            ?.focus();

        return;

    }


    let mensagem =
        `Olá! Gostaria de fazer um pedido na Gorete Festas. 🎂\n\n`;


    mensagem +=
        `👤 *Cliente:* ${nome}\n`;

    mensagem +=
        `📱 *WhatsApp:* ${telefone}\n\n`;


    mensagem +=
        `🛒 *PEDIDO*\n\n`;


    carrinho.forEach((item, index) => {

        mensagem +=
            `*${index + 1}. ${item.nome}*\n`;


        if (item.tipo === "bolo-personalizado") {

            mensagem +=
                `🎂 Tamanho: ${item.tamanho}\n`;

            mensagem +=
                `🍰 Massa: ${item.massa}\n`;

            mensagem +=
                `🍫 Recheios: ${item.recheio}\n`;

            if (item.adicionais?.length) {
                mensagem +=
                    `➕ Adicionais: ${item.adicionais.join(", ")}\n`;
            }

            mensagem +=
                `🎨 Cor: ${item.cor}\n`;

            mensagem +=
                `✨ Topo: ${item.topo}\n`;

            if (item.topoValorPendente) {
                mensagem +=
                    `💬 Valor do topo: a confirmar após orçamento da gráfica\n`;
            }

            mensagem +=
                `📅 Retirada: ${formatarData(item.data)}\n`;

            mensagem +=
                `🕐 Horário: ${item.horario}\n`;

            if (item.fotoBoloUrl) {
                mensagem +=
                    `📷 Inspiração do bolo: ${item.fotoBoloUrl}\n`;
            }

            if (item.fotoTopoUrl) {
                mensagem +=
                    `🎂 Inspiração do topo: ${item.fotoTopoUrl}\n`;
            }

        }


        if (item.tipo === "docinhos") {

            mensagem +=
                `🍬 Categoria: ${item.categoria}\n`;

            mensagem +=
                `🔢 Docinhos: ${item.unidades} unidades\n`;

            mensagem +=
                `🍫 Sabores: ${item.sabores.join(", ")}\n`;

            mensagem +=
                item.tipoCobranca === "pacote"
                    ? `💵 Pacote: ${item.quantidadePacote} unidades por ${formatarMoeda(item.precoPacote)}\n`
                    : `💵 Valor unitário: ${formatarMoeda(item.precoUnitario)}\n`;

            mensagem +=
                `📅 Retirada: ${formatarData(item.data)}\n`;

            mensagem +=
                `🕐 Horário: ${item.horario}\n`;
        }


        if (item.tipo === "cupcakes") {

            mensagem +=
                `🧁 Tipo: ${item.nome}\n`;

            mensagem +=
                `🔢 Cupcakes: ${item.unidades} unidade(s)\n`;

            mensagem +=
                `💵 Valor unitário: ${formatarMoeda(item.precoUnitario)}\n`;

            mensagem +=
                `📅 Retirada: ${formatarData(item.data)}\n`;

            mensagem +=
                `🕐 Horário: ${item.horario}\n`;
        }


        if (item.tipo === "caseirinho") {

            mensagem +=
                `🍊 Sabor: ${item.sabor}\n`;

            mensagem +=
                `📏 Tamanho: ${item.tamanho}\n`;

            mensagem +=
                `📅 Retirada: ${formatarData(item.data)}\n`;

            mensagem +=
                `🕐 Horário: ${item.horario}\n`;
        }


        mensagem +=
            `🔢 Quantidade do pedido: ${item.quantidade}\n`;


        mensagem +=
            `💰 Valor: ${formatarMoeda(
                item.preco *
                item.quantidade
            )}\n\n`;

    });


    const total =
        carrinho.reduce(
            (soma, item) =>
                soma +
                (
                    item.preco *
                    item.quantidade
                ),
            0
        );


    mensagem +=
        `💰 *TOTAL DO PEDIDO: ${formatarMoeda(total)}*\n`;


    if (observacao) {

        mensagem +=
            `\n📝 *Observações:*\n${observacao}\n`;

    }


    mensagem +=
        `\n📍 Retirada no local - Bairro Caju`;


    /*
       WHATSAPP DA GORETE FESTAS
       (21) 99417-4117
    */

    const numeroWhatsApp =
        "5521994174117";


    const url =
        "https://wa.me/" +
        numeroWhatsApp +
        "?text=" +
        encodeURIComponent(mensagem);


    window.open(
        url,
        "_blank"
    );

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
   CUPCAKES - REGRAS VINDAS DO SUPABASE
===================================================== */

let regrasCupcakesSupabase = [];
let regraCupcakeAtual = null;

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
        throw new Error("Não foi possível carregar os preços dos cupcakes.");
    }

    return await resposta.json();
}

function nomeCategoriaCupcake(categoria) {

    const nomes = {
        tradicional: "Cupcake tradicional",
        decorado: "Com topinho e saia"
    };

    return nomes[categoria] ||
        String(categoria || "")
            .replaceAll("_", " ")
            .replace(/\b\w/g, letra => letra.toUpperCase());
}

function categoriasCupcakesDisponiveis() {

    return [
        ...new Set(
            regrasCupcakesSupabase
                .map(item => item.categoria)
                .filter(Boolean)
        )
    ];
}

function menorPrecoCupcake(categoria) {

    const regras = regrasCupcakesSupabase
        .filter(item => item.categoria === categoria)
        .sort(
            (a, b) =>
                Number(a.quantidade_minima || 0) -
                Number(b.quantidade_minima || 0)
        );

    return regras[0] || null;
}

function renderizarTiposCupcake() {

    const container =
        document.getElementById("opcoesTipoCupcake");

    if (!container) {
        return;
    }

    const categorias =
        categoriasCupcakesDisponiveis();

    if (!categorias.length) {

        container.innerHTML = `
            <div class="opcoes-indisponiveis">
                Nenhum tipo de cupcake foi cadastrado ainda.
            </div>
        `;

        return;
    }

    container.innerHTML = "";

    categorias.forEach(categoria => {

        const regraInicial =
            menorPrecoCupcake(categoria);

        const label =
            document.createElement("label");

        label.className = "opcao-card";

        label.innerHTML = `
            <input
                type="radio"
                name="tipoCupcake"
                value="${escaparHtmlSite(categoria)}"
            >

            <span>
                <strong>${escaparHtmlSite(nomeCategoriaCupcake(categoria))}</strong>
                <small>
                    ${
                        regraInicial
                            ? `${formatarMoeda(regraInicial.preco_unitario)} / unidade`
                            : "Preço conforme cadastro"
                    }
                </small>
                ${
                    regraInicial?.nome
                        ? `<em>${escaparHtmlSite(regraInicial.nome)}</em>`
                        : ""
                }
            </span>
        `;

        container.appendChild(label);
    });
}

function tipoCupcakeSelecionado() {

    return document.querySelector(
        'input[name="tipoCupcake"]:checked'
    )?.value || "";
}

function encontrarRegraCupcake(categoria, quantidade) {

    if (!categoria || !quantidade) {
        return null;
    }

    return regrasCupcakesSupabase
        .filter(item =>
            item.categoria === categoria &&
            Number(item.quantidade_minima || 0) <= quantidade
        )
        .sort(
            (a, b) =>
                Number(b.quantidade_minima || 0) -
                Number(a.quantidade_minima || 0)
        )[0] || null;
}

function proximaRegraCupcake(categoria, quantidade) {

    return regrasCupcakesSupabase
        .filter(item =>
            item.categoria === categoria &&
            Number(item.quantidade_minima || 0) > quantidade
        )
        .sort(
            (a, b) =>
                Number(a.quantidade_minima || 0) -
                Number(b.quantidade_minima || 0)
        )[0] || null;
}

function atualizarCupcake() {

    const categoria =
        tipoCupcakeSelecionado();

    const quantidade =
        Number(
            document.getElementById("quantidadeCupcakes")?.value || 0
        );

    const feedback =
        document.getElementById("regraCupcakeFeedback");

    regraCupcakeAtual =
        encontrarRegraCupcake(categoria, quantidade);

    if (!categoria) {

        if (feedback) {
            feedback.textContent =
                "Escolha um tipo de cupcake e informe a quantidade.";
            feedback.className =
                "regra-docinho-feedback";
        }

        atualizarResumoCupcakes();
        return;
    }

    if (!quantidade) {

        const primeira =
            menorPrecoCupcake(categoria);

        if (feedback) {
            feedback.textContent =
                primeira
                    ? `Informe a quantidade. Valor atual: ${formatarMoeda(primeira.preco_unitario)} por unidade.`
                    : "Informe a quantidade.";
            feedback.className =
                "regra-docinho-feedback";
        }

        atualizarResumoCupcakes();
        return;
    }

    if (!regraCupcakeAtual) {

        const proxima =
            proximaRegraCupcake(categoria, quantidade);

        if (feedback) {
            feedback.textContent =
                proxima
                    ? `A quantidade mínima para esta opção é ${Number(proxima.quantidade_minima)} unidade(s).`
                    : "Não existe uma regra de preço ativa para esta quantidade.";
            feedback.className =
                "regra-docinho-feedback alerta";
        }

        atualizarResumoCupcakes();
        return;
    }

    if (feedback) {
        feedback.innerHTML =
            `<strong>${formatarMoeda(regraCupcakeAtual.preco_unitario)} por unidade</strong>`;

        feedback.className =
            "regra-docinho-feedback sucesso";
    }

    atualizarResumoCupcakes();
}

function atualizarResumoCupcakes() {

    const categoria =
        tipoCupcakeSelecionado();

    const quantidade =
        Number(
            document.getElementById("quantidadeCupcakes")?.value || 0
        );

    const preco =
        regraCupcakeAtual
            ? Number(regraCupcakeAtual.preco_unitario || 0)
            : 0;

    const total =
        quantidade * preco;

    const resumoTipo =
        document.getElementById("resumoTipoCupcake");

    const resumoQuantidade =
        document.getElementById("resumoQuantidadeCupcake");

    const resumoPreco =
        document.getElementById("resumoPrecoCupcake");

    const resumoTotal =
        document.getElementById("valorTotalCupcakes");

    if (resumoTipo) {
        resumoTipo.textContent =
            categoria
                ? nomeCategoriaCupcake(categoria)
                : "—";
    }

    if (resumoQuantidade) {
        resumoQuantidade.textContent =
            quantidade > 0
                ? `${quantidade} unidade(s)`
                : "—";
    }

    if (resumoPreco) {
        resumoPreco.textContent =
            regraCupcakeAtual
                ? formatarMoeda(preco)
                : "—";
    }

    if (resumoTotal) {
        resumoTotal.textContent =
            formatarMoeda(total);
    }
}

function configurarEventosCupcakes() {

    const painel =
        document.getElementById("painelCupcakes");

    if (!painel || painel.dataset.eventosAtivos === "true") {
        return;
    }

    painel.dataset.eventosAtivos = "true";

    painel.addEventListener("change", function(event) {

        if (event.target.name === "tipoCupcake") {

            const quantidade =
                document.getElementById("quantidadeCupcakes");

            if (quantidade) {
                quantidade.value = "";
            }

            regraCupcakeAtual = null;
            atualizarCupcake();
        }
    });

    document.getElementById("quantidadeCupcakes")
        ?.addEventListener("input", atualizarCupcake);
}

async function carregarMontagemCupcakes() {

    if (!document.getElementById("painelCupcakes")) {
        return;
    }

    try {

        regrasCupcakesSupabase =
            await buscarRegrasCupcakesSupabase();

        renderizarTiposCupcake();
        configurarEventosCupcakes();
        atualizarResumoCupcakes();

    } catch (erro) {

        console.error("Erro ao carregar cupcakes:", erro);

        const container =
            document.getElementById("opcoesTipoCupcake");

        if (container) {
            container.innerHTML = `
                <div class="opcoes-indisponiveis">
                    Não foi possível carregar os cupcakes.
                    Atualize a página e tente novamente.
                </div>
            `;
        }
    }
}

function adicionarCupcakesCarrinho() {

    const categoria =
        tipoCupcakeSelecionado();

    const quantidade =
        Number(
            document.getElementById("quantidadeCupcakes")?.value || 0
        );

    const data =
        document.getElementById("dataRetiradaCupcakes")?.value;

    const horario =
        document.getElementById("horaRetiradaCupcakes")?.value;

    if (!categoria) {
        alert("Escolha o tipo de cupcake.");
        return;
    }

    if (!quantidade) {
        alert("Informe a quantidade de cupcakes.");
        return;
    }

    atualizarCupcake();

    if (!regraCupcakeAtual) {
        alert("A quantidade informada não atende às regras atuais desta opção.");
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

    const precoUnitario =
        Number(regraCupcakeAtual.preco_unitario || 0);

    const total =
        quantidade * precoUnitario;

    carrinho.push({
        id: Date.now(),
        tipo: "cupcakes",
        nome: nomeCategoriaCupcake(categoria),
        categoria: categoria,
        unidades: quantidade,
        precoUnitario: precoUnitario,
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
        carregarMontagemCupcakes();
        carregarMontagemCaseirinhos();
    }
);



/* =====================================================
   CENTRAL DE ENCOMENDAS
===================================================== */

function selecionarTipoEncomenda(tipo) {

    const painelBolo =
        document.getElementById("painelBolo");

    const painelDocinhos =
        document.getElementById("painelDocinhos");

    const painelCupcakes =
        document.getElementById("painelCupcakes");

    const painelCaseirinhos =
        document.getElementById("painelCaseirinhos");

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

        selecionarTipoEncomenda("bolo");

    }
);
