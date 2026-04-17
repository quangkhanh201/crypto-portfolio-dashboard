document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshBtn');
    const btnText = refreshBtn.querySelector('.btn-text');
    const loader = refreshBtn.querySelector('.loader-spinner');
    const totalValueEl = document.getElementById('totalValue');
    const assetsTableBody = document.getElementById('assetsTableBody');
    const errorMessageEl = document.getElementById('errorMessage');

    const formatCurrency = (value) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(value);
    };

    const formatVND = (value) => {
        return new Intl.NumberFormat('vi-VN', {
            style: 'currency',
            currency: 'VND'
        }).format(value);
    };

    const formatNumber = (value) => {
        return new Intl.NumberFormat('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
        }).format(value);
    };

    let chartInstance = null;

    const fetchPortfolio = async () => {
        setLoading(true);
        errorMessageEl.style.display = 'none';

        try {
            // Fetch USD to VND rate
            const rateRes = await fetch('https://open.er-api.com/v6/latest/USD');
            const rateData = await rateRes.json();
            const vndRate = rateData.rates.VND || 25000;

            const response = await fetch('/api/portfolio');
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Failed to fetch portfolio data');
            }

            renderPortfolio(data, vndRate);
        } catch (error) {
            console.error('Error fetching data:', error);
            errorMessageEl.textContent = error.message;
            errorMessageEl.style.display = 'block';
        } finally {
            setLoading(false);
        }
    };

    const renderPortfolio = (data, vndRate) => {
        // Update total value
        totalValueEl.textContent = formatCurrency(data.totalValue);
        document.getElementById('totalValueVnd').textContent = `≈ ${formatVND(data.totalValue * vndRate)}`;

        // Update Total P&L
        const totalPnlEl = document.getElementById('totalPnl');
        const totalPnlPercentageEl = document.getElementById('totalPnlPercentage');
        const totalPnlDisplay = document.getElementById('totalPnlDisplay');
        const totalPnlVndEl = document.getElementById('totalPnlVnd');
        
        if (data.totalPnl !== undefined) {
            totalPnlEl.textContent = `${data.totalPnl >= 0 ? '+' : ''}${formatCurrency(data.totalPnl)}`;
            totalPnlPercentageEl.textContent = `${data.totalPnlPercentage >= 0 ? '+' : ''}${data.totalPnlPercentage.toFixed(2)}%`;
            totalPnlDisplay.className = 'pnl-display ' + (data.totalPnl >= 0 ? 'pnl-positive' : 'pnl-negative');
            totalPnlVndEl.textContent = `≈ ${data.totalPnl >= 0 ? '+' : ''}${formatVND(data.totalPnl * vndRate)}`;
        }

        // Draw Chart
        renderChart(data.assets);

        // Update table
        assetsTableBody.innerHTML = '';

        if (data.assets.length === 0) {
            assetsTableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="empty-state">No assets found in your spot account.</td>
                </tr>
            `;
            return;
        }

        data.assets.forEach(item => {
            const tr = document.createElement('tr');
            
            // Asset
            const tdAsset = document.createElement('td');
            tdAsset.className = 'asset-name';
            tdAsset.textContent = item.asset;
            
            // Amount
            const tdAmount = document.createElement('td');
            tdAmount.className = 'right-align';
            tdAmount.textContent = formatNumber(item.amount);

            // Avg Price
            const tdAvgPrice = document.createElement('td');
            tdAvgPrice.className = 'right-align asset-price';
            tdAvgPrice.textContent = item.avgPrice > 0 ? formatCurrency(item.avgPrice) : 'N/A';

            // Price
            const tdPrice = document.createElement('td');
            tdPrice.className = 'right-align asset-price';
            tdPrice.textContent = item.price > 0 ? formatCurrency(item.price) : 'N/A';

            // Total Value
            const tdValue = document.createElement('td');
            tdValue.className = 'right-align asset-value';
            tdValue.textContent = formatCurrency(item.value);

            // PNL
            const tdPnl = document.createElement('td');
            tdPnl.className = 'right-align ' + (item.pnl >= 0 ? 'pnl-positive' : 'pnl-negative');
            tdPnl.textContent = item.avgPrice > 0 ? `${item.pnl >= 0 ? '+' : ''}${formatCurrency(item.pnl)}` : '-';

            // PNL %
            const tdPnlPerc = document.createElement('td');
            tdPnlPerc.className = 'right-align ' + (item.pnlPercentage >= 0 ? 'pnl-positive' : 'pnl-negative');
            tdPnlPerc.textContent = item.avgPrice > 0 ? `${item.pnlPercentage >= 0 ? '+' : ''}${item.pnlPercentage.toFixed(2)}%` : '-';

            tr.appendChild(tdAsset);
            tr.appendChild(tdAmount);
            tr.appendChild(tdAvgPrice);
            tr.appendChild(tdPrice);
            tr.appendChild(tdValue);
            tr.appendChild(tdPnl);
            tr.appendChild(tdPnlPerc);

            assetsTableBody.appendChild(tr);
        });
    };

    const renderChart = (assets) => {
        const ctx = document.getElementById('portfolioChart').getContext('2d');
        
        // Prepare data
        const labels = assets.map(a => a.asset);
        const dataValues = assets.map(a => a.value);
        
        // Generate some nice colors based on the assets count
        const bgColors = [
            '#3b82f6', '#10b981', '#f59e0b', '#ef4444', 
            '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#f97316'
        ];

        if (chartInstance) {
            chartInstance.destroy();
        }

        chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: dataValues,
                    backgroundColor: bgColors.slice(0, assets.length),
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#f8fafc',
                            font: {
                                family: "'Inter', sans-serif"
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    };

    const setLoading = (isLoading) => {
        if (isLoading) {
            refreshBtn.disabled = true;
            btnText.style.display = 'none';
            loader.style.display = 'block';
        } else {
            refreshBtn.disabled = false;
            btnText.style.display = 'block';
            loader.style.display = 'none';
        }
    };

    // Initial fetch
    fetchPortfolio();

    // Refresh on click
    refreshBtn.addEventListener('click', fetchPortfolio);
});
