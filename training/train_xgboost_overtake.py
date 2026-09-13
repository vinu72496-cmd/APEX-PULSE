"""
train_xgboost_overtake.py — Trains the Short-Horizon Overtake Risk-Reward Advisor.

Features (per the Shared Feature State):
    closing_speed_kph   : relative closing speed on the car ahead
    gap_distance_m      : distance to car ahead
    tyre_age_delta      : (own tyre age laps) - (rival tyre age laps)
    drs_available       : 0/1
    soc                 : current state of charge (0-1)
    battery_cost_mj      : MJ of deployment required to complete the move

Label:
    overtake_success    : 1 if the move is a net-positive (completed pass without
                           losing net time / crashing), 0 otherwise

Replace `synthesize_training_data()` with real labeled data pulled from your
FastF1 backtests or sim-racing telemetry logs as soon as you have it — this
generator only exists to get a working pipeline end-to-end before real data
is collected.

Install: pip install xgboost scikit-learn pandas numpy
"""
import argparse
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score
import xgboost as xgb
import joblib
import os

FEATURES = [
    "closing_speed_kph",
    "gap_distance_m",
    "tyre_age_delta",
    "drs_available",
    "soc",
    "battery_cost_mj",
]


def synthesize_training_data(n=20_000, seed=42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    closing_speed = rng.normal(8, 6, n).clip(-10, 40)          # kph
    gap = rng.uniform(0.1, 2.5, n) * 30                         # metres (~0.1-2.5s gap)
    tyre_delta = rng.normal(0, 6, n)                             # laps, own - rival
    drs = rng.integers(0, 2, n)
    soc = rng.uniform(0.05, 1.0, n)
    battery_cost = rng.uniform(0.5, 4.0, n)

    # Latent "true" success probability — a plausible physics-flavored function
    logit = (
        0.09 * closing_speed
        - 0.04 * gap
        - 0.10 * tyre_delta
        + 1.1 * drs
        + 1.4 * (soc - battery_cost / 4.0)
        - 0.6
    )
    prob = 1 / (1 + np.exp(-logit))
    success = rng.binomial(1, prob)

    return pd.DataFrame({
        "closing_speed_kph": closing_speed,
        "gap_distance_m": gap,
        "tyre_age_delta": tyre_delta,
        "drs_available": drs,
        "soc": soc,
        "battery_cost_mj": battery_cost,
        "overtake_success": success,
    })


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_csv", type=str, default=None,
                         help="Path to real labeled telemetry CSV. If omitted, uses synthetic data.")
    parser.add_argument("--out", type=str, default="../backend/app/models/xgb_overtake.json")
    args = parser.parse_args()

    if args.data_csv:
        df = pd.read_csv(args.data_csv)
    else:
        print("No --data_csv provided: using synthetic data to bootstrap the pipeline.")
        df = synthesize_training_data()

    X = df[FEATURES]
    y = df["overtake_success"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="logloss",
        random_state=42,
    )
    model.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    preds = model.predict(X_test)
    probs = model.predict_proba(X_test)[:, 1]
    print(classification_report(y_test, preds))
    print(f"ROC AUC: {roc_auc_score(y_test, probs):.3f}")
    print("Feature importances:", dict(zip(FEATURES, model.feature_importances_.round(3))))

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    model.save_model(args.out)
    print(f"Saved XGBoost model to {args.out}")


if __name__ == "__main__":
    main()
