const GRAPH_HINT_TEXT =
	"Solte aqui uma imagem (PNG, JPG, SVG ou WEBP) ou use o botão acima.";
const SUPPORTED_IMAGE_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/jpg",
	"image/svg+xml",
	"image/webp",
]);
const MIME_EXTENSION_MAP = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/svg+xml": "svg",
	"image/webp": "webp",
};

const state = {
	config: {
		finalizadoSegundaContagem: 0,
		finalizadoPrimeiraContagem: 0,
		itensNovos: 0,
		total: 0,
	},
	countMode: "primeira",
	graphs: {
		grafico1: null,
		grafico2: null,
	},
};

function parseNumber(value) {
	if (value === null || value === undefined || value === "") {
		return 0;
	}
	const parsed = Number(value);
	return Number.isNaN(parsed) ? 0 : parsed;
}

function serializeInputs(map) {
	return Object.entries(map).reduce((acc, [key, input]) => {
		if (!input) {
			acc[key] = null;
			return acc;
		}
		if (input.type === "number") {
			acc[key] = parseNumber(input.value);
			return acc;
		}
		acc[key] = input.value;
		return acc;
	}, {});
}

function formatDateToBR(date) {
	if (!(date instanceof Date) || Number.isNaN(date.valueOf())) {
		return "";
	}

	const day = String(date.getDate()).padStart(2, "0");
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const year = date.getFullYear();
	return `${day}/${month}/${year}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getDateKey(date) {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function computeEasterDate(year) {
	const a = year % 19;
	const b = Math.floor(year / 100);
	const c = year % 100;
	const d = Math.floor(b / 4);
	const e = b % 4;
	const f = Math.floor((b + 8) / 25);
	const g = Math.floor((b - f + 1) / 3);
	const h = (19 * a + b - d - g + 15) % 30;
	const i = Math.floor(c / 4);
	const k = c % 4;
	const l = (32 + 2 * e + 2 * i - h - k) % 7;
	const m = Math.floor((a + 11 * h + 22 * l) / 451);
	const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
	const day = ((h + l - 7 * m + 114) % 31) + 1;
	return new Date(Date.UTC(year, month, day));
}

function generateBrazilHolidaySet(startYear, endYear) {
	const holidays = new Set();
	const fixedDates = [
		[0, 1], // 01/01
		[3, 21], // 21/04 - Tiradentes
		[4, 1], // 01/05 - Dia do Trabalho
		[8, 7], // 07/09 - Independência
		[9, 12], // 12/10 - Nossa Senhora Aparecida
		[10, 2], // 02/11 - Finados
		[10, 15], // 15/11 - Proclamação da República
		[11, 25], // 25/12 - Natal
	];

	for (let year = startYear; year <= endYear; year += 1) {
		fixedDates.forEach(([month, day]) => {
			holidays.add(`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
		});

		const easter = computeEasterDate(year);
		const goodFriday = new Date(easter.getTime() - 2 * MS_PER_DAY);
		const carnivalMonday = new Date(easter.getTime() - 48 * MS_PER_DAY);
		const carnivalTuesday = new Date(easter.getTime() - 47 * MS_PER_DAY);
		const corpusChristi = new Date(easter.getTime() + 60 * MS_PER_DAY);

		[goodFriday, carnivalMonday, carnivalTuesday, corpusChristi].forEach((moveable) => {
			holidays.add(getDateKey(moveable));
		});
	}

	return holidays;
}

function calculateLocalCalendar(startDate, endDate, extraHolidays = []) {
	if (!(startDate instanceof Date) || Number.isNaN(startDate.valueOf())) {
		return { diasNormal: 0, diasUteis: 0 };
	}
	if (!(endDate instanceof Date) || Number.isNaN(endDate.valueOf()) || endDate <= startDate) {
		return { diasNormal: 0, diasUteis: 0 };
	}

	const start = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
	const end = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));
	const totalDays = Math.floor((end - start) / MS_PER_DAY);

	if (totalDays <= 0) {
		return { diasNormal: 0, diasUteis: 0 };
	}

	const startYear = start.getUTCFullYear();
	const endYear = end.getUTCFullYear();
	const holidays = generateBrazilHolidaySet(startYear, endYear);
	extraHolidays.forEach((holiday) => {
		if (!holiday) {
			return;
		}
		holidays.add(String(holiday));
	});

	let businessDays = 0;
	for (let offset = 1; offset <= totalDays; offset += 1) {
		const current = new Date(start.getTime() + offset * MS_PER_DAY);
		const weekday = current.getUTCDay();
		if (weekday === 0 || weekday === 6) {
			continue;
		}
		if (holidays.has(getDateKey(current))) {
			continue;
		}
		businessDays += 1;
	}

	return { diasNormal: totalDays, diasUteis: businessDays };
}

document.addEventListener("DOMContentLoaded", () => {
	const dataAtualizacaoInput = document.querySelector("#data-atualizacao");
	const armazemInput = document.querySelector("#armazem");
	const saveDashboardBtn = document.querySelector("#save-dashboard");
	const configBtn = document.querySelector("#config-btn");
	const configModal = document.querySelector("#config-modal");
	const configForm = document.querySelector("#config-form");
	const closeConfigBtn = document.querySelector("#close-config");
	const configTotalInput = document.querySelector("#config-total");
	const parametersBtn = document.querySelector("#parameters-btn");
	const parametersModal = document.querySelector("#parameters-modal");
	const parametersForm = document.querySelector("#parameters-form");
	const closeParametersBtn = document.querySelector("#close-parameters");
	const countModeButtons = Array.from(
		document.querySelectorAll("[data-count-mode]"),
	);
	const configInputs = {
		finalizadoSegundaContagem: document.querySelector("#config-finalizado-segunda"),
		finalizadoPrimeiraContagem: document.querySelector("#config-finalizado-primeira"),
		itensNovos: document.querySelector("#config-itens-novos"),
	};

	let autoRefreshTimeoutId = null;
	let latestDashboardRequestId = 0;
	let latestDashboardResponseId = 0;
	let lastActiveGraphKey = null;
	const graphContextMenu = document.querySelector("#graph-context-menu");
	const graphContextPasteBtn = graphContextMenu?.querySelector(
		"[data-graph-context=\"paste\"]",
	);
	let currentGraphContextKey = null;

	const metricsInputs = {
		totalSkusEstoque: document.querySelector("#total-skus-estoque"),
		skusRestanteSegunda: document.querySelector("#skus-restante-segunda"),
		skusSegundaConcluida: document.querySelector("#skus-segunda-concluida"),
		skusPrimeiraConcluida: document.querySelector("#skus-primeira-concluida"),
		percentualSemContagem: document.querySelector("#percentual-sem-contagem"),
		percentualContadoSegunda: document.querySelector("#percentual-contado-segunda"),
		percentualContadoPrimeira: document.querySelector("#percentual-contado-primeira"),
		percentualSemContagemSegunda: document.querySelector("#percentual-sem-contagem-segunda"),
		skusRestantePrimeira: document.querySelector("#skus-restante-primeira"),
		metaContagemDiaria: document.querySelector("#meta-contagem-diaria"),
		previsaoTermino: document.querySelector("#previsao-termino"),
	};
	const dashboardCardElements = Array.from(
		document.querySelectorAll("#dashboard-cards .card"),
	);
	const visibleDashboardFieldsByCountMode = {
		primeira: [
			"totalSkusEstoque",
			"skusRestantePrimeira",
			"skusPrimeiraConcluida",
			"percentualContadoPrimeira",
			"percentualSemContagem",
		],
		segunda: [
			"totalSkusEstoque",
			"skusRestanteSegunda",
			"skusSegundaConcluida",
			"percentualContadoSegunda",
			"percentualSemContagemSegunda",
		],
	};

	const parametersInputs = {
		diasNormal: document.querySelector("#dias-normal"),
		diasUteis: document.querySelector("#dias-uteis"),
	};

	const graphPlaceholders = Array.from(
		document.querySelectorAll(".graph-placeholder"),
	);
	const graphElements = new Map();

	function setCountMode(mode) {
		if (mode !== "primeira" && mode !== "segunda") {
			return;
		}

		state.countMode = mode;
		document.body.dataset.countMode = mode;

		countModeButtons.forEach((button) => {
			const isActive = button.dataset.countMode === mode;
			button.classList.toggle("is-active", isActive);
			button.setAttribute("aria-pressed", String(isActive));
		});
	}

	function renderGraphPlaceholder(key) {
		const element = graphElements.get(key);
		if (!element) {
			return;
		}

		const { placeholder, content, clearBtn, label } = element;
		const data = state.graphs?.[key];

		if (data?.src) {
			placeholder.classList.add("is-filled");
			if (clearBtn) {
				clearBtn.hidden = false;
			}
			content.innerHTML = `<img src="${data.src}" alt="Imagem anexada ao ${label}">`;
		} else {
			placeholder.classList.remove("is-filled");
			if (clearBtn) {
				clearBtn.hidden = true;
			}
			content.innerHTML = `<span class="graph-placeholder__hint">${GRAPH_HINT_TEXT}</span>`;
		}
	}

	function handleGraphFileSelection(key, fileList) {
		const file = fileList?.[0];
		if (!file) {
			return;
		}

		applyGraphFile(key, file);
	}

	function applyGraphFile(key, file) {
		if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
			alert("Formato de imagem não suportado. Utilize PNG, JPG, SVG ou WEBP.");
			return false;
		}

		const reader = new FileReader();
		reader.onload = () => {
			state.graphs[key] = {
				src: reader.result,
				name:
					file.name?.trim() && file.name !== ""
						? file.name
						: `grafico-${Date.now()}.${MIME_EXTENSION_MAP[file.type] ?? "png"}`,
				type: file.type,
				lastModified: file.lastModified,
			};
			renderGraphPlaceholder(key);
		};
		reader.readAsDataURL(file);
		return true;
	}

	async function pasteImageFromClipboard(key) {
		if (!navigator.clipboard?.read) {
			alert(
				"Seu navegador não permite ler imagens do clipboard automaticamente. Use Ctrl+V ou o botão Carregar imagem.",
			);
			return;
		}

		try {
			const items = await navigator.clipboard.read();
			for (const item of items) {
				const supportedType = item.types.find((type) =>
					SUPPORTED_IMAGE_TYPES.has(type),
				);
				if (!supportedType) {
					continue;
				}
				const blob = await item.getType(supportedType);
				const extension = MIME_EXTENSION_MAP[supportedType] ?? "png";
				const file = new File(
					[blob],
					`clipboard-${Date.now()}.${extension}`,
					{ type: supportedType, lastModified: Date.now() },
				);
				if (applyGraphFile(key, file)) {
					return;
				}
			}
			alert("Não encontrei imagens na área de transferência.");
		} catch (error) {
			console.error(error);
			alert(
				"Não foi possível acessar a área de transferência. Verifique as permissões do navegador ou utilize Ctrl+V.",
			);
		}
	}

	function showGraphContextMenu(event, key) {
		if (!graphContextMenu) {
			return;
		}

		hideGraphContextMenu();

		currentGraphContextKey = key;
		graphContextMenu.hidden = false;
		graphContextMenu.style.left = "0px";
		graphContextMenu.style.top = "0px";

		requestAnimationFrame(() => {
			const menuRect = graphContextMenu.getBoundingClientRect();
			const padding = 8;
			const viewportWidth = window.innerWidth + window.scrollX;
			const viewportHeight = window.innerHeight + window.scrollY;
			let left = event.pageX;
			let top = event.pageY;

			if (left + menuRect.width + padding > viewportWidth) {
				left = viewportWidth - menuRect.width - padding;
			}
			if (top + menuRect.height + padding > viewportHeight) {
				top = viewportHeight - menuRect.height - padding;
			}

			left = Math.max(window.scrollX + padding, left);
			top = Math.max(window.scrollY + padding, top);

			graphContextMenu.style.left = `${left}px`;
			graphContextMenu.style.top = `${top}px`;
		});
	}

	function hideGraphContextMenu() {
		if (!graphContextMenu) {
			return;
		}
		graphContextMenu.hidden = true;
		currentGraphContextKey = null;
	}

	graphPlaceholders.forEach((placeholder) => {
		const key = placeholder.dataset.graphKey;
		if (!key) {
			return;
		}

		const input = placeholder.querySelector(".graph-placeholder__input");
		const uploadBtn = placeholder.querySelector(
			"[data-graph-action=\"upload\"]",
		);
		const clearBtn = placeholder.querySelector(
			"[data-graph-action=\"clear\"]",
		);
		const content = placeholder.querySelector("[data-graph-content]");
		const label = placeholder.querySelector("h3")?.textContent ?? "gráfico";

		graphElements.set(key, {
			placeholder,
			input,
			uploadBtn,
			clearBtn,
			content,
			label,
		});

		placeholder.addEventListener("mouseenter", () => {
			lastActiveGraphKey = key;
		});

		placeholder.addEventListener("mousedown", () => {
			lastActiveGraphKey = key;
		});

		placeholder.addEventListener("focusin", () => {
			lastActiveGraphKey = key;
		});

		uploadBtn?.addEventListener("click", () => {
			input?.click();
		});

		clearBtn?.addEventListener("click", () => {
			state.graphs[key] = null;
			renderGraphPlaceholder(key);
		});

		input?.addEventListener("change", (event) => {
			handleGraphFileSelection(key, event.target.files);
			event.target.value = "";
		});

		placeholder.addEventListener("dragover", (event) => {
			event.preventDefault();
			placeholder.classList.add("is-dragging");
		});

		placeholder.addEventListener("dragleave", () => {
			placeholder.classList.remove("is-dragging");
		});

		placeholder.addEventListener("drop", (event) => {
			event.preventDefault();
			placeholder.classList.remove("is-dragging");
			handleGraphFileSelection(key, event.dataTransfer?.files);
		});

		placeholder.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			showGraphContextMenu(event, key);
		});

		renderGraphPlaceholder(key);
	});

	countModeButtons.forEach((button) => {
		button.addEventListener("click", () => {
			setCountMode(button.dataset.countMode);
		});
	});

	setCountMode(state.countMode);

	graphContextPasteBtn?.addEventListener("click", async () => {
		if (!currentGraphContextKey) {
			return;
		}
		await pasteImageFromClipboard(currentGraphContextKey);
		hideGraphContextMenu();
	});

	document.addEventListener("click", (event) => {
		if (!graphContextMenu || graphContextMenu.hidden) {
			return;
		}
		if (graphContextMenu.contains(event.target)) {
			return;
		}
		hideGraphContextMenu();
	});

	document.addEventListener("contextmenu", (event) => {
		if (event.target.closest?.(".graph-placeholder")) {
			return;
		}
		hideGraphContextMenu();
	});

	document.addEventListener("keydown", (event) => {
		if (event.key === "Escape") {
			hideGraphContextMenu();
		}
	});

	window.addEventListener("blur", hideGraphContextMenu);

	document.addEventListener(
		"scroll",
		() => {
			hideGraphContextMenu();
		},
		true,
	);

	document.addEventListener("paste", (event) => {
		const files = event.clipboardData?.files;
		if (!files?.length) {
			return;
		}

		const targetKey = currentGraphContextKey ?? lastActiveGraphKey;
		if (!targetKey) {
			return;
		}

		event.preventDefault();
		handleGraphFileSelection(targetKey, files);
		hideGraphContextMenu();
	});

	if (dataAtualizacaoInput) {
		dataAtualizacaoInput.value = formatDateToBR(new Date());
	}

	function populateConfigInputsFromState() {
		if (configInputs.finalizadoSegundaContagem) {
			configInputs.finalizadoSegundaContagem.value =
				state.config.finalizadoSegundaContagem ?? "";
		}

		if (configInputs.finalizadoPrimeiraContagem) {
			configInputs.finalizadoPrimeiraContagem.value =
				state.config.finalizadoPrimeiraContagem ?? "";
		}

		if (configInputs.itensNovos) {
			configInputs.itensNovos.value = state.config.itensNovos ?? "";
		}
	}

	function scheduleAutoRefresh() {
		if (autoRefreshTimeoutId) {
			clearTimeout(autoRefreshTimeoutId);
		}

		autoRefreshTimeoutId = window.setTimeout(() => {
			autoRefreshTimeoutId = null;
			submitDashboard({ silent: true });
		}, 600);
	}

	function syncConfigStateFromInputs({ skipDerived = false } = {}) {
		const finalizadoSegunda = parseNumber(
			configInputs.finalizadoSegundaContagem?.value,
		);
		const finalizadoPrimeira = parseNumber(
			configInputs.finalizadoPrimeiraContagem?.value,
		);
		const itensNovos = parseNumber(configInputs.itensNovos?.value);

		state.config = {
			...state.config,
			finalizadoSegundaContagem: finalizadoSegunda,
			finalizadoPrimeiraContagem: finalizadoPrimeira,
			itensNovos,
		};
		state.config.total =
			finalizadoSegunda + finalizadoPrimeira + itensNovos;

		if (configTotalInput) {
			configTotalInput.value = state.config.total ?? "";
		}

		if (!skipDerived) {
			updateDerivedMetrics();
		}
	}

	syncConfigStateFromInputs({ skipDerived: true });

	function updateDerivedMetrics() {
		const primeira = parseNumber(state.config?.finalizadoPrimeiraContagem);
		const segunda = parseNumber(state.config?.finalizadoSegundaContagem);
		const novos = parseNumber(state.config?.itensNovos);
		const totalConfig = parseNumber(state.config?.total);
		const diasUteis = parseNumber(parametersInputs?.diasUteis?.value);

		const skusRestanteSegunda = primeira + novos * 2;
		const skusRestantePrimeira = novos;
		const skusSegundaConcluida = segunda;
		const totalSkusEstoque = totalConfig + novos;
		const metaDiaria = diasUteis > 0 ? Math.ceil(skusRestanteSegunda / diasUteis) : 0;
		const percentualSemContagem = totalSkusEstoque > 0 ? (skusRestanteSegunda / totalSkusEstoque) * 100 : 0;
		const percentualContadoSegunda = totalSkusEstoque > 0 ? (skusSegundaConcluida / totalSkusEstoque) * 100 : 0;
		const percentualContadoPrimeira = totalConfig > 0 ? (novos / totalConfig) * 100 : 0;
		const baseSemContagemSegunda = primeira + novos * 2;
		const percentualSemContagemSegunda = baseSemContagemSegunda > 0
			? 100 - (segunda / baseSemContagemSegunda) * 100
			: 0;

		if (metricsInputs.skusRestanteSegunda) {
			metricsInputs.skusRestanteSegunda.value = skusRestanteSegunda;
		}

		if (metricsInputs.skusSegundaConcluida) {
			metricsInputs.skusSegundaConcluida.value = skusSegundaConcluida;
		}

		if (metricsInputs.skusPrimeiraConcluida) {
			metricsInputs.skusPrimeiraConcluida.value = skusPrimeiraConcluida;
		}

		if (metricsInputs.skusRestantePrimeira) {
			metricsInputs.skusRestantePrimeira.value = skusRestantePrimeira;
		}

		if (metricsInputs.totalSkusEstoque) {
			metricsInputs.totalSkusEstoque.value = totalSkusEstoque;
		}

		if (metricsInputs.metaContagemDiaria) {
			metricsInputs.metaContagemDiaria.value = metaDiaria;
		}

		if (metricsInputs.percentualSemContagem) {
			metricsInputs.percentualSemContagem.value = Number(percentualSemContagem.toFixed(2));
		}

		if (metricsInputs.percentualContadoSegunda) {
			metricsInputs.percentualContadoSegunda.value = Number(percentualContadoSegunda.toFixed(2));
		}

		if (metricsInputs.percentualContadoPrimeira) {
			metricsInputs.percentualContadoPrimeira.value = Number(percentualContadoPrimeira.toFixed(2));
		}

		if (metricsInputs.percentualSemContagemSegunda) {
			metricsInputs.percentualSemContagemSegunda.value = Number(percentualSemContagemSegunda.toFixed(2));
		}
	}

	updateDerivedMetrics();

	function toggleDialog(dialog, open) {
		if (!dialog) {
			return;
		}
		if (typeof dialog.showModal === "function") {
			open ? dialog.showModal() : dialog.close();
			return;
		}
		dialog.toggleAttribute("open", open);
	}

	configBtn?.addEventListener("click", () => {
		populateConfigInputsFromState();
		toggleDialog(configModal, true);
	});
	closeConfigBtn?.addEventListener("click", () => toggleDialog(configModal, false));

	configModal?.addEventListener("cancel", (event) => {
		event.preventDefault();
		toggleDialog(configModal, false);
	});

	parametersBtn?.addEventListener("click", () => toggleDialog(parametersModal, true));
	closeParametersBtn?.addEventListener("click", () => toggleDialog(parametersModal, false));

	parametersModal?.addEventListener("cancel", (event) => {
		event.preventDefault();
		toggleDialog(parametersModal, false);
	});

	parametersForm?.addEventListener("submit", (event) => {
		event.preventDefault();
		toggleDialog(parametersModal, false);
	});

	Object.values(configInputs).forEach((input) => {
		input?.addEventListener("input", () => {
			syncConfigStateFromInputs();
			scheduleAutoRefresh();
		});
	});

	metricsInputs.previsaoTermino?.addEventListener("change", () => {
		scheduleAutoRefresh();
	});

	configForm?.addEventListener("submit", async (event) => {
		event.preventDefault();
		syncConfigStateFromInputs();
		const payload = {
			finalizadoSegundaContagem: state.config.finalizadoSegundaContagem,
			finalizadoPrimeiraContagem: state.config.finalizadoPrimeiraContagem,
			itensNovos: state.config.itensNovos,
		};

		try {
			const response = await fetch("/api/configuracoes", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error(`Falha ao salvar configurações: ${response.status}`);
			}

			const data = await response.json();
			state.config = {
				...state.config,
				...payload,
				total: data?.total ?? state.config.total,
			};

			configTotalInput.value = state.config.total ?? "";
			populateConfigInputsFromState();
			updateDerivedMetrics();
			console.info("Configurações atualizadas", state.config);
			toggleDialog(configModal, false);
			submitDashboard({ silent: true });
		} catch (error) {
			console.error(error);
			alert("Não foi possível salvar as configurações. Tente novamente.");
		}
	});

	async function submitDashboard({ silent = false } = {}) {
		if (autoRefreshTimeoutId) {
			clearTimeout(autoRefreshTimeoutId);
			autoRefreshTimeoutId = null;
		}

		syncConfigStateFromInputs({ skipDerived: true });
		updateDerivedMetrics();

		const metrics = serializeInputs(metricsInputs);
		const parameters = serializeInputs(parametersInputs);
		const payload = {
			metrics,
			config: state.config,
			parameters,
		};

		const requestId = ++latestDashboardRequestId;

		if (!silent) {
			console.info("Enviando payload", payload);
		}

		const runLocalCalendarFallback = () => {
			const previsaoRaw = metricsInputs.previsaoTermino?.value || "";
			const startDate = new Date();
			const endDate = previsaoRaw ? new Date(`${previsaoRaw}T00:00:00`) : null;
			const extraHolidays = Array.isArray(parameters?.feriados) ? parameters.feriados : [];
			const { diasNormal, diasUteis } = calculateLocalCalendar(startDate, endDate, extraHolidays);

			if (parametersInputs.diasNormal) {
				parametersInputs.diasNormal.value = diasNormal ? String(diasNormal) : "0";
			}
			if (parametersInputs.diasUteis) {
				parametersInputs.diasUteis.value = diasUteis ? String(diasUteis) : "0";
			}

			updateDerivedMetrics();
			console.warn("Fallback local: calendário atualizado no frontend.", { diasNormal, diasUteis });
		};

		try {
			const response = await fetch("/api/dashboard", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error(`Falha ao salvar dashboard: ${response.status}`);
			}

			const data = await response.json();

			if (requestId < latestDashboardResponseId) {
				return;
			}

			latestDashboardResponseId = requestId;
			applyDashboardResponse(data, { silent });

			if (!silent) {
				alert("Dashboard salvo com sucesso!");
			}
		} catch (error) {
			console.error(error);
			runLocalCalendarFallback();
			if (!silent) {
				alert("Não foi possível salvar o dashboard. Verifique sua conexão e tente novamente.");
			}
		}
	}

	function applyDashboardResponse(data, { silent = false } = {}) {
		if (!data) {
			return;
		}

		if (data?.dataAtualizacao && dataAtualizacaoInput) {
			dataAtualizacaoInput.value = data.dataAtualizacao;
		}

		if (data?.armazem && armazemInput) {
			armazemInput.value = data.armazem;
		}

		if (data?.configuracoes) {
			state.config = {
				...state.config,
				...data.configuracoes,
			};
			configTotalInput.value = state.config.total ?? "";
			populateConfigInputsFromState();
		}

		if (data?.parameters) {
			if (Object.prototype.hasOwnProperty.call(data.parameters, "diasNormal")) {
				parametersInputs.diasNormal.value = data.parameters.diasNormal ?? "";
			}

			if (Object.prototype.hasOwnProperty.call(data.parameters, "diasUteis")) {
				parametersInputs.diasUteis.value = data.parameters.diasUteis ?? "";
			}
		}

		updateDerivedMetrics();

		if (!silent) {
			console.info("Resposta do backend", data);
		}
	}

	saveDashboardBtn?.addEventListener("click", () => {
		submitDashboard();
	});
});
