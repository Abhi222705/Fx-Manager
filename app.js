/* =========================================
   GLOBAL THEME
========================================= */

document.addEventListener("DOMContentLoaded", function () {

    const theme =
        localStorage.getItem("fxTheme") || "dark";

    if (theme === "light") {
        document.body.classList.add("light-theme");
    } else {
        document.body.classList.remove("light-theme");
    }

});

/* =========================================
   FX MANAGER - GLOBAL DATA SYSTEM
========================================= */


/* =========================================
   GET TRADES FROM LOCAL STORAGE
========================================= */

let trades =
    JSON.parse(
        localStorage.getItem("fxTrades")
    ) || [];


/* =========================================
   SAVE TRADES
========================================= */

function saveTrades() {

    localStorage.setItem(
        "fxTrades",
        JSON.stringify(trades)
    );

}


/* =========================================
   STARTING BALANCE
========================================= */

function getStartingBalance() {

    const savedBalance =
        localStorage.getItem(
            "fxStartingBalance"
        );


    if (savedBalance !== null) {

        return Number(savedBalance);

    }


    return 0;

}


/* =========================================
   SET STARTING BALANCE
========================================= */

function setStartingBalance(amount) {

    localStorage.setItem(
        "fxStartingBalance",
        Number(amount)
    );


    updateDashboard();

}


/* =========================================
   FORMAT MONEY
========================================= */

function formatMoney(amount) {

    const number =
        Number(amount || 0);


    return "$" +
        number.toLocaleString(
            "en-US",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );

}


/* =========================================
   SAFE TEXT UPDATE
========================================= */

function setText(id, value) {

    const element =
        document.getElementById(id);


    if (element) {

        element.textContent = value;

    }

}


/* =========================================
   DASHBOARD UPDATE
========================================= */

function updateDashboard() {


    /*
       Refresh trades from localStorage.

       This makes sure the dashboard always
       uses the latest saved trade data.
    */

    trades =
        JSON.parse(
            localStorage.getItem("fxTrades")
        ) || [];


    const totalTrades =
        trades.length;


    const winningTrades =
        trades.filter(
            trade =>
                String(trade.result || "")
                    .toUpperCase() === "WIN"
        );


    const losingTrades =
        trades.filter(
            trade =>
                String(trade.result || "")
                    .toUpperCase() === "LOSS"
        );


    const totalPnL =
        trades.reduce(
            (sum, trade) =>
                sum +
                Number(trade.pnl || 0),
            0
        );


    const winRate =
        totalTrades > 0
            ? (
                winningTrades.length /
                totalTrades
            ) * 100
            : 0;


    const accountBalance =
        getStartingBalance() +
        totalPnL;


    setText(
        "accountBalance",
        formatMoney(accountBalance)
    );


    setText(
        "totalPnL",
        formatMoney(totalPnL)
    );


    setText(
        "winRate",
        winRate.toFixed(1) + "%"
    );


    setText(
        "tradeCount",
        totalTrades
    );


    const pnlElement =
        document.getElementById(
            "totalPnL"
        );


    if (pnlElement) {

        pnlElement.classList.remove(
            "positive",
            "negative"
        );


        if (totalPnL > 0) {

            pnlElement.classList.add(
                "positive"
            );

        }


        if (totalPnL < 0) {

            pnlElement.classList.add(
                "negative"
            );

        }

    }


    renderRecentTrades();

    updateJournalPreview();

    renderPerformanceChart();

}


/* =========================================
   RECENT TRADES
========================================= */

function renderRecentTrades() {


    const table =
        document.getElementById(
            "recentTrades"
        );


    if (!table) {

        return;

    }


    table.innerHTML = "";


    const recentTrades =
        [...trades]
            .sort(
                (a, b) =>
                    new Date(b.date) -
                    new Date(a.date)
            )
            .slice(0, 5);


    if (recentTrades.length === 0) {

        const row =
            document.createElement("tr");


        row.innerHTML = `

            <td colspan="7"
                class="empty-table">

                No trades yet.

            </td>

        `;


        table.appendChild(row);


        return;

    }


    recentTrades.forEach(
        trade => {


            const row =
                document.createElement(
                    "tr"
                );


            const pnl =
                Number(
                    trade.pnl || 0
                );


            const direction =
                String(
                    trade.direction || ""
                ).toUpperCase();


            const result =
                String(
                    trade.result || ""
                ).toUpperCase();


            const directionClass =
                direction === "BUY"
                    ? "buy"
                    : direction === "SELL"
                        ? "sell"
                        : "";


            const resultClass =
                result === "WIN"
                    ? "win"
                    : result === "LOSS"
                        ? "loss"
                        : "";


            row.innerHTML = `

                <td>

                    <strong>
                        ${trade.pair || "-"}
                    </strong>

                </td>


                <td>

                    <span class="${directionClass}">

                        ${trade.direction || "-"}

                    </span>

                </td>


                <td>
                    ${trade.entry || "-"}
                </td>


                <td>
                    ${trade.exit || "-"}
                </td>


                <td>
                    ${trade.rr || "-"}
                </td>


                <td>

                    <span class="${resultClass}">

                        ${trade.result || "-"}

                    </span>

                </td>


                <td class="${
                    pnl > 0
                        ? "positive"
                        : pnl < 0
                            ? "negative"
                            : ""
                }">

                    ${pnl > 0 ? "+" : ""}

                    ${formatMoney(pnl)}

                </td>

            `;


            table.appendChild(row);

        }
    );

}


/* =========================================
   TODAY'S DATE
========================================= */

function updateTodayDate() {


    const element =
        document.getElementById(
            "today"
        );


    if (element) {

        const today =
            new Date();


        element.textContent =
            today.toLocaleDateString(
                "en-IN",
                {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                }
            );

    }


    const journalDate =
        document.getElementById(
            "journalDate"
        );


    if (journalDate) {

        const today =
            new Date();


        journalDate.textContent =
            today.toLocaleDateString(
                "en-IN",
                {
                    day: "numeric",
                    month: "long",
                    year: "numeric"
                }
            );

    }

}


/* =========================================
   JOURNAL PREVIEW
========================================= */

function updateJournalPreview() {


    const now =
        new Date();


    const year =
        now.getFullYear();


    const month =
        String(
            now.getMonth() + 1
        ).padStart(2, "0");


    const day =
        String(
            now.getDate()
        ).padStart(2, "0");


    const today =
        `${year}-${month}-${day}`;


    const journal =
        JSON.parse(
            localStorage.getItem(
                "journal_" + today
            )
        );


    const todayTrades =
        trades.filter(
            trade =>
                trade.date === today
        );


    setText(
        "journalTrades",
        todayTrades.length
    );


    if (!journal) {

        setText(
            "journalBias",
            "—"
        );


        setText(
            "journalSession",
            "—"
        );


        setText(
            "journalEmotion",
            "—"
        );


        return;

    }


    setText(
        "journalBias",
        journal.bias || "—"
    );


    setText(
        "journalSession",
        journal.session || "—"
    );


    setText(
        "journalEmotion",
        journal.emotion || "—"
    );

}


/* =========================================
   PERFORMANCE CHART
========================================= */


/*
   Global Chart.js instance.

   We keep the existing chart so it can
   be destroyed before creating a new one.
*/

let performanceChart = null;


/* =========================================
   GET TRADE DATE
========================================= */

function getTradeDate(trade) {

    if (!trade || !trade.date) {

        return null;

    }


    const date =
        new Date(
            trade.date + "T00:00:00"
        );


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return null;

    }


    return date;

}


/* =========================================
   FORMAT CHART DATE
========================================= */

function formatChartDate(date) {

    return date.toLocaleDateString(
        "en-IN",
        {
            day: "numeric",
            month: "short"
        }
    );

}


/* =========================================
   RENDER PERFORMANCE CHART
========================================= */

function renderPerformanceChart() {


    const canvas =
        document.getElementById(
            "performanceChart"
        );


    const emptyState =
        document.getElementById(
            "chartEmptyState"
        );


    const rangeSelect =
        document.getElementById(
            "chartRange"
        );


    if (!canvas) {

        return;

    }


    /*
       Check whether Chart.js loaded.
    */

    if (
        typeof Chart === "undefined"
    ) {

        if (emptyState) {

            emptyState.textContent =
                "Chart library could not be loaded.";

            emptyState.style.display =
                "flex";

        }

        return;

    }


    /*
       Get selected range.
    */

    const selectedRange =
        rangeSelect
            ? Number(
                rangeSelect.value
            )
            : 30;


    /*
       Refresh trades from storage.
    */

    const storedTrades =
        JSON.parse(
            localStorage.getItem("fxTrades")
        ) || [];


    /*
       Convert valid trades into
       usable chart records.
    */

    const validTrades =
        storedTrades
            .map(
                trade => {

                    const date =
                        getTradeDate(
                            trade
                        );


                    if (!date) {

                        return null;

                    }


                    return {

                        date: date,

                        pnl:
                            Number(
                                trade.pnl || 0
                            )

                    };

                }
            )
            .filter(
                trade => trade !== null
            );


    /*
       Today's date.
    */

    const today =
        new Date();


    today.setHours(
        0,
        0,
        0,
        0
    );


    /*
       Beginning of selected period.
    */

    const startDate =
        new Date(
            today
        );


    startDate.setDate(
        startDate.getDate() -
        (
            selectedRange - 1
        )
    );


    /*
       Only trades inside selected
       period are used.
    */

    const periodTrades =
        validTrades
            .filter(
                trade =>
                    trade.date >= startDate &&
                    trade.date <= today
            )
            .sort(
                (a, b) =>
                    a.date - b.date
            );


    /*
       Destroy previous chart.
    */

    if (performanceChart) {

        performanceChart.destroy();

        performanceChart = null;

    }


    /*
       If no trades are available,
       show empty state.
    */

    if (
        periodTrades.length === 0
    ) {

        canvas.style.display =
            "none";


        if (emptyState) {

            emptyState.textContent =
                "No trades available for this period.";

            emptyState.style.display =
                "flex";

        }

        return;

    }


    /*
       Hide empty state.
    */

    canvas.style.display =
        "block";


    if (emptyState) {

        emptyState.style.display =
            "none";

    }


    /*
       Build cumulative P&L.

       If several trades happen on the
       same date, their P&L is combined.
    */

    const dailyPnL = {};


    periodTrades.forEach(
        trade => {

            const key =
                trade.date
                    .toISOString()
                    .split("T")[0];


            if (
                !dailyPnL[key]
            ) {

                dailyPnL[key] = 0;

            }


            dailyPnL[key] +=
                trade.pnl;

        }
    );


    /*
       Sort dates.
    */

    const dateKeys =
        Object.keys(
            dailyPnL
        ).sort();


    /*
       Starting balance for chart.

       The chart represents account
       balance movement from the
       beginning of the selected range.
    */

    let cumulativePnL = 0;


    const labels = [];

    const data = [];


    dateKeys.forEach(
        key => {

            const date =
                new Date(
                    key + "T00:00:00"
                );


            cumulativePnL +=
                dailyPnL[key];


            labels.push(
                formatChartDate(
                    date
                )
            );


            data.push(
                Number(
                    cumulativePnL.toFixed(2)
                )
            );

        }
    );


    /*
       Create chart.
    */

    performanceChart =
        new Chart(
            canvas,
            {

                type: "line",

                data: {

                    labels: labels,

                    datasets: [

                        {

                            label:
                                "Cumulative P&L",

                            data: data,

                            borderWidth: 2,

                            pointRadius: 3,

                            pointHoverRadius: 5,

                            tension: 0.3,

                            fill: true

                        }

                    ]

                },


                options: {

                    responsive: true,

                    maintainAspectRatio: false,


                    interaction: {

                        intersect: false,

                        mode: "index"

                    },


                    plugins: {

                        legend: {

                            display: false

                        },


                        tooltip: {

                            callbacks: {

                                label:
                                    function (
                                        context
                                    ) {

                                        const value =
                                            Number(
                                                context.parsed.y || 0
                                            );


                                        return (
                                            value >= 0
                                                ? "+"
                                                : ""
                                        )
                                        +
                                        formatMoney(
                                            value
                                        );

                                    }

                            }

                        }

                    },


                    scales: {

                        x: {

                            grid: {

                                display: false

                            },

                            ticks: {

                                color:
                                    "#8b95a7",

                                maxTicksLimit:
                                    8

                            }

                        },


                        y: {

                            grid: {

                                color:
                                    "rgba(255,255,255,0.06)"

                            },

                            ticks: {

                                color:
                                    "#8b95a7",

                                callback:
                                    function (
                                        value
                                    ) {

                                        return (
                                            value >= 0
                                                ? "+"
                                                : ""
                                        )
                                        +
                                        "$" +
                                        Number(
                                            value
                                        ).toLocaleString(
                                            "en-US"
                                        );

                                    }

                            }

                        }

                    }

                }

            }
        );

}


/* =========================================
   SIDEBAR
========================================= */

function toggleSidebar() {


    const sidebar =
        document.querySelector(
            ".sidebar"
        );


    if (sidebar) {

        sidebar.classList.toggle(
            "open"
        );

    }

}


/* =========================================
   PAGE LOAD
========================================= */

document.addEventListener(
    "DOMContentLoaded",
    function () {


        /*
           Update dashboard.
        */

        updateDashboard();


        /*
           Update today's date.
        */

        updateTodayDate();


        /*
           Chart range selector.
        */

        const rangeSelect =
            document.getElementById(
                "chartRange"
            );


        if (rangeSelect) {

            rangeSelect.addEventListener(
                "change",
                function () {

                    renderPerformanceChart();

                }
            );

        }

    }
);