from pathlib import Path
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression

BASE = Path(".")
DATA_DIR = BASE / "data"
GRAPH_DIR = BASE / "assets" / "graphs"

DATA_DIR.mkdir(parents=True, exist_ok=True)
GRAPH_DIR.mkdir(parents=True, exist_ok=True)

RAW_FILE = DATA_DIR / "electrolysis_data.csv"

# Load raw data
df = pd.read_csv(RAW_FILE)
df.columns = [c.strip() for c in df.columns]

# Convert numeric columns
for col in ["Trial", "Voltage (V)", "Current (A)", "Time (s)", "Hydrogen Volume (mL)", "H2 Rate (mL/s)"]:
    if col in df.columns:
        df[col] = pd.to_numeric(df[col], errors="coerce")

df = df.dropna(subset=["Voltage (V)", "Current (A)", "Time (s)", "Hydrogen Volume (mL)"]).copy()

# Constants
F = 96485       # C/mol
Vm = 24000      # mL/mol, approx room temp

# Calculations
df["Hydrogen Production Rate (mL/s)"] = df["Hydrogen Volume (mL)"] / df["Time (s)"]
df["Theoretical Hydrogen Volume (mL)"] = (df["Current (A)"] * df["Time (s)"]) / (2 * F) * Vm
df["Efficiency (%)"] = (df["Hydrogen Volume (mL)"] / df["Theoretical Hydrogen Volume (mL)"]) * 100
df["Percent Error vs Theory (%)"] = (
    (df["Theoretical Hydrogen Volume (mL)"] - df["Hydrogen Volume (mL)"]) /
    df["Theoretical Hydrogen Volume (mL)"]
) * 100

summary = (
    df.groupby("Voltage (V)", as_index=False)
    .agg(
        Mean_Current_A=("Current (A)", "mean"),
        SD_Current_A=("Current (A)", "std"),
        Mean_Hydrogen_mL=("Hydrogen Volume (mL)", "mean"),
        SD_Hydrogen_mL=("Hydrogen Volume (mL)", "std"),
        Mean_Rate_mLs=("Hydrogen Production Rate (mL/s)", "mean"),
        SD_Rate_mLs=("Hydrogen Production Rate (mL/s)", "std"),
        Mean_Theoretical_mL=("Theoretical Hydrogen Volume (mL)", "mean"),
        Mean_Efficiency_pct=("Efficiency (%)", "mean"),
        SD_Efficiency_pct=("Efficiency (%)", "std"),
    )
    .fillna(0)
)

# Save processed data
df.to_csv(DATA_DIR / "electrolysis_data_processed.csv", index=False)
summary.to_csv(DATA_DIR / "electrolysis_summary_by_voltage.csv", index=False)

def fit_line(x, y):
    model = LinearRegression().fit(np.array(x).reshape(-1, 1), np.array(y))
    y_pred = model.predict(np.array(x).reshape(-1, 1))
    r2 = model.score(np.array(x).reshape(-1, 1), np.array(y))
    return model.coef_[0], model.intercept_, r2, y_pred

# 1. Voltage vs Current
m, b, r2, yfit = fit_line(summary["Voltage (V)"], summary["Mean_Current_A"])
plt.figure(figsize=(8, 5))
plt.errorbar(summary["Voltage (V)"], summary["Mean_Current_A"], yerr=summary["SD_Current_A"], fmt="o", capsize=4)
plt.plot(summary["Voltage (V)"], yfit)
plt.xlabel("Voltage (V)")
plt.ylabel("Current (A)")
plt.title("Voltage vs Current")
plt.text(0.03, 0.97, f"y = {m:.4f}x + {b:.4f}\n$R^2$ = {r2:.4f}", transform=plt.gca().transAxes, va="top")
plt.tight_layout()
plt.savefig(GRAPH_DIR / "voltage_vs_current.png", dpi=200)
plt.close()

# 2. Voltage vs Hydrogen
m, b, r2, yfit = fit_line(summary["Voltage (V)"], summary["Mean_Hydrogen_mL"])
plt.figure(figsize=(8, 5))
plt.errorbar(summary["Voltage (V)"], summary["Mean_Hydrogen_mL"], yerr=summary["SD_Hydrogen_mL"], fmt="o", capsize=4)
plt.plot(summary["Voltage (V)"], yfit)
plt.xlabel("Voltage (V)")
plt.ylabel("Hydrogen Volume (mL)")
plt.title("Voltage vs Hydrogen Volume")
plt.text(0.03, 0.97, f"y = {m:.4f}x + {b:.4f}\n$R^2$ = {r2:.4f}", transform=plt.gca().transAxes, va="top")
plt.tight_layout()
plt.savefig(GRAPH_DIR / "voltage_vs_hydrogen.png", dpi=200)
plt.close()

# 3. Actual vs Theoretical Hydrogen
plt.figure(figsize=(8, 5))
plt.errorbar(
    summary["Voltage (V)"],
    summary["Mean_Hydrogen_mL"],
    yerr=summary["SD_Hydrogen_mL"],
    fmt="o",
    capsize=4,
    label="Actual Hydrogen"
)
plt.plot(summary["Voltage (V)"], summary["Mean_Hydrogen_mL"], label="Actual Trend")
plt.plot(summary["Voltage (V)"], summary["Mean_Theoretical_mL"], label="Ideal Yield")
plt.xlabel("Voltage (V)")
plt.ylabel("Hydrogen Volume (mL)")
plt.title("Actual vs Theoretical Hydrogen Volume")
plt.legend()
plt.tight_layout()
plt.savefig(GRAPH_DIR / "actual_vs_theoretical_hydrogen.png", dpi=200)
plt.close()

# 4. Current vs Hydrogen
m, b, r2, yfit = fit_line(summary["Mean_Current_A"], summary["Mean_Hydrogen_mL"])
plt.figure(figsize=(8, 5))
plt.errorbar(summary["Mean_Current_A"], summary["Mean_Hydrogen_mL"], yerr=summary["SD_Hydrogen_mL"], fmt="o", capsize=4)
plt.plot(summary["Mean_Current_A"], yfit)
plt.xlabel("Current (A)")
plt.ylabel("Hydrogen Volume (mL)")
plt.title("Current vs Hydrogen Volume")
plt.text(0.03, 0.97, f"y = {m:.4f}x + {b:.4f}\n$R^2$ = {r2:.4f}", transform=plt.gca().transAxes, va="top")
plt.tight_layout()
plt.savefig(GRAPH_DIR / "current_vs_hydrogen.png", dpi=200)
plt.close()

# 5. Voltage vs Efficiency
m, b, r2, yfit = fit_line(summary["Voltage (V)"], summary["Mean_Efficiency_pct"])
plt.figure(figsize=(8, 5))
plt.errorbar(summary["Voltage (V)"], summary["Mean_Efficiency_pct"], yerr=summary["SD_Efficiency_pct"], fmt="o", capsize=4)
plt.plot(summary["Voltage (V)"], yfit)
plt.xlabel("Voltage (V)")
plt.ylabel("Efficiency (%)")
plt.title("Voltage vs Efficiency")
plt.text(0.03, 0.97, f"y = {m:.4f}x + {b:.4f}\n$R^2$ = {r2:.4f}", transform=plt.gca().transAxes, va="top")
plt.tight_layout()
plt.savefig(GRAPH_DIR / "voltage_vs_efficiency.png", dpi=200)
plt.close()

# 6. Voltage vs Rate
m, b, r2, yfit = fit_line(summary["Voltage (V)"], summary["Mean_Rate_mLs"])
plt.figure(figsize=(8, 5))
plt.errorbar(summary["Voltage (V)"], summary["Mean_Rate_mLs"], yerr=summary["SD_Rate_mLs"], fmt="o", capsize=4)
plt.plot(summary["Voltage (V)"], yfit)
plt.xlabel("Voltage (V)")
plt.ylabel("Hydrogen Production Rate (mL/s)")
plt.title("Voltage vs Hydrogen Production Rate")
plt.text(0.03, 0.97, f"y = {m:.5f}x + {b:.5f}\n$R^2$ = {r2:.4f}", transform=plt.gca().transAxes, va="top")
plt.tight_layout()
plt.savefig(GRAPH_DIR / "voltage_vs_rate.png", dpi=200)
plt.close()

print("Done. Processed CSVs and graph images generated.")
