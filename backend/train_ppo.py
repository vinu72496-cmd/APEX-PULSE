"""
train_ppo.py — Trains the Long-Horizon Energy Deployment Optimizer.

Usage:
    python train_ppo.py --timesteps 200000 --out ../backend/app/models/ppo_energy.zip

Install:
    pip install stable-baselines3[extra] gymnasium torch
"""
import argparse
import os

from stable_baselines3 import PPO
from stable_baselines3.common.env_util import make_vec_env
from stable_baselines3.common.monitor import Monitor

from energy_env import EnergyDeploymentEnv


def make_env(seed):
    def _init():
        env = EnergyDeploymentEnv(stint_laps=30, seed=seed)
        return Monitor(env)
    return _init


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--timesteps", type=int, default=200_000)
    parser.add_argument("--n_envs", type=int, default=8)
    parser.add_argument("--out", type=str, default="models/ppo_energy.zip")
    args = parser.parse_args()

    vec_env = make_vec_env(lambda: EnergyDeploymentEnv(stint_laps=30), n_envs=args.n_envs)

    model = PPO(
        "MlpPolicy",
        vec_env,
        verbose=1,
        learning_rate=3e-4,
        n_steps=1024,
        batch_size=256,
        gamma=0.995,          # long-horizon: care about the whole stint
        gae_lambda=0.95,
        clip_range=0.2,
        ent_coef=0.01,
        tensorboard_log="./tb_logs/ppo_energy",
    )

    model.learn(total_timesteps=args.timesteps, progress_bar=True)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    model.save(args.out)
    print(f"Saved PPO model to {args.out}")

    # Also sync to app/models if running in backend/
    app_models_path = os.path.join(os.path.dirname(args.out), "..", "app", "models", os.path.basename(args.out))
    try:
        if os.path.exists(os.path.dirname(app_models_path)):
            import shutil
            shutil.copyfile(args.out, app_models_path)
    except Exception:
        pass

    # quick sanity rollout
    eval_env = EnergyDeploymentEnv(stint_laps=30, seed=42)
    obs, _ = eval_env.reset()
    total_reward = 0.0
    for _ in range(30):
        action, _ = model.predict(obs, deterministic=True)
        obs, reward, terminated, truncated, info = eval_env.step(int(action))
        total_reward += reward
        eval_env.render()
        if terminated or truncated:
            break
    print(f"Eval stint total reward: {total_reward:.2f}")


if __name__ == "__main__":
    main()
