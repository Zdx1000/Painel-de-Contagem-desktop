const state = {
	config: {
		finalizadoSegundaContagem: 0,
		finalizadoPrimeiraContagem: 0,
		itensNovos: 0,
		total: 0,
	},
	countMode: "primeira",
};
const DASHBOARD_CACHE_KEY = "inventarioRotativo.dashboard.v1";

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

function safeReadDashboardCache() {
	try {
		const rawCache = window.localStorage?.getItem(DASHBOARD_CACHE_KEY);
		if (!rawCache) {
			return null;
		}
		return JSON.parse(rawCache);
	} catch (error) {
		console.warn("Não foi possível ler o cache local do dashboard.", error);
		return null;
	}
}

function safeWriteDashboardCache(payload) {
	try {
		window.localStorage?.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(payload));
		return true;
	} catch (error) {
		console.error("Não foi possível salvar o cache local do dashboard.", error);
		return false;
	}
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

	function setInputValue(input, value) {
		if (!input || value === null || value === undefined) {
			return;
		}
		input.value = value;
	}

	function applyCachedDashboard(cache) {
		if (!cache || typeof cache !== "object") {
			return;
		}

		const cachedConfig = cache.config ?? {};
		state.config = {
			...state.config,
			finalizadoSegundaContagem: parseNumber(cachedConfig.finalizadoSegundaContagem),
			finalizadoPrimeiraContagem: parseNumber(cachedConfig.finalizadoPrimeiraContagem),
			itensNovos: parseNumber(cachedConfig.itensNovos),
			total: parseNumber(cachedConfig.total),
		};
		state.config.total =
			state.config.finalizadoSegundaContagem +
			state.config.finalizadoPrimeiraContagem +
			state.config.itensNovos;

		if (cache.countMode === "primeira" || cache.countMode === "segunda") {
			state.countMode = cache.countMode;
		}

		setInputValue(dataAtualizacaoInput, cache.dataAtualizacao);
		setInputValue(armazemInput, cache.armazem);
		setInputValue(metricsInputs.previsaoTermino, cache.metrics?.previsaoTermino);
		setInputValue(parametersInputs.diasNormal, cache.parameters?.diasNormal);
		setInputValue(parametersInputs.diasUteis, cache.parameters?.diasUteis);

		if (configTotalInput) {
			configTotalInput.value = state.config.total ?? "";
		}
		populateConfigInputsFromState();
	}

	function buildDashboardCachePayload() {
		syncConfigStateFromInputs({ skipDerived: true });
		updateDerivedMetrics();

		return {
			version: 1,
			savedAt: new Date().toISOString(),
			countMode: state.countMode,
			dataAtualizacao: dataAtualizacaoInput?.value ?? "",
			armazem: armazemInput?.value ?? "",
			config: { ...state.config },
			metrics: serializeInputs(metricsInputs),
			parameters: serializeInputs(parametersInputs),
		};
	}

	function saveDashboardCache() {
		const payload = buildDashboardCachePayload();
		const saved = safeWriteDashboardCache(payload);
		if (saved) {
			console.info("Dashboard salvo no cache do navegador.", payload);
		}
		return saved;
	}

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

		updateDashboardCardVisibility();
		updateDerivedMetrics();
	}

	function updateDashboardCardVisibility() {
		const orderedFields = visibleDashboardFieldsByCountMode[state.countMode];
		if (!orderedFields) {
			return;
		}

		dashboardCardElements.forEach((card) => {
			const field = card.dataset.field;
			const visibleIndex = orderedFields.indexOf(field);
			const shouldHide = visibleIndex === -1;

			card.hidden = shouldHide;
			card.setAttribute("aria-hidden", String(shouldHide));
			card.style.order = shouldHide ? "" : String(visibleIndex);
		});
	}

	countModeButtons.forEach((button) => {
		button.addEventListener("click", () => {
			setCountMode(button.dataset.countMode);
			saveDashboardCache();
		});
	});

	applyCachedDashboard(safeReadDashboardCache());
	setCountMode(state.countMode);

	if (dataAtualizacaoInput && !dataAtualizacaoInput.value) {
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
		const skusPrimeiraConcluida = primeira;
		const totalSkusEstoque = totalConfig;
		const skusBaseMetaDiaria = state.countMode === "primeira"
			? skusRestantePrimeira
			: skusRestanteSegunda;
		const metaDiaria = diasUteis > 0 ? Math.ceil(skusBaseMetaDiaria / diasUteis) : 0;
		const percentualSemContagem = totalConfig > 0 ? (novos / totalConfig) * 100 : 0;
		const percentualContadoSegunda = totalSkusEstoque > 0 ? (skusSegundaConcluida / totalSkusEstoque) * 100 : 0;
		const percentualContadoPrimeira = totalConfig > 0 ? (primeira / totalConfig) * 100 : 0;
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
		updateDerivedMetrics();
		saveDashboardCache();
		toggleDialog(parametersModal, false);
	});

	Object.values(configInputs).forEach((input) => {
		input?.addEventListener("input", () => {
			syncConfigStateFromInputs();
			scheduleAutoRefresh();
		});
	});

	metricsInputs.previsaoTermino?.addEventListener("change", () => {
		saveDashboardCache();
		scheduleAutoRefresh();
	});

	configForm?.addEventListener("submit", async (event) => {
		event.preventDefault();
		syncConfigStateFromInputs();
		if (!saveDashboardCache()) {
			alert("Não foi possível salvar as configurações no cache do navegador.");
			return;
		}
		toggleDialog(configModal, false);

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
			saveDashboardCache();
			console.info("Configurações atualizadas", state.config);
		} catch (error) {
			console.warn("Configurações salvas localmente; sincronização remota indisponível.", error);
		}
	});

	async function submitDashboard({ silent = false } = {}) {
		if (autoRefreshTimeoutId) {
			clearTimeout(autoRefreshTimeoutId);
			autoRefreshTimeoutId = null;
		}

		syncConfigStateFromInputs({ skipDerived: true });
		updateDerivedMetrics();
		const cacheSaved = saveDashboardCache();

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
			saveDashboardCache();

			if (!silent) {
				alert("Dashboard salvo com sucesso!");
			}
		} catch (error) {
			console.error(error);
			runLocalCalendarFallback();
			saveDashboardCache();
			if (!silent) {
				alert(cacheSaved
					? "Dashboard salvo no cache do navegador."
					: "Não foi possível salvar o dashboard no cache do navegador.");
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
