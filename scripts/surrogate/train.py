import os
import sys
import time
import argparse
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import TensorDataset, DataLoader
from scipy.stats import spearmanr

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# 1. 残差网络架构
class ResidualBlock(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.fc1 = nn.Linear(dim, dim)
        self.norm1 = nn.LayerNorm(dim)
        self.act = nn.GELU()
        self.fc2 = nn.Linear(dim, dim)
        self.norm2 = nn.LayerNorm(dim)

    def forward(self, x):
        residual = x
        out = self.act(self.norm1(self.fc1(x)))
        out = self.norm2(self.fc2(out))
        return out + residual

class SurrogateResMLP(nn.Module):
    def __init__(self, in_dim=480):
        super().__init__()
        self.stem = nn.Sequential(
            nn.Linear(in_dim, 256),
            nn.LayerNorm(256),
            nn.GELU()
        )
        self.res1 = ResidualBlock(256)
        self.res2 = ResidualBlock(256)
        self.head = nn.Sequential(
            nn.Linear(256, 128),
            nn.GELU(),
            nn.Linear(128, 64),
            nn.GELU(),
            nn.Linear(64, 1)
        )

    def forward(self, x):
        h = self.stem(x)
        h = self.res1(h)
        h = self.res2(h)
        return self.head(h)

def train(epochs=20, batch_size=512, lr=1e-3, device_str='auto'):
    feat_path = os.path.join('training_data', 'features.bin')
    label_path = os.path.join('training_data', 'labels.bin')
    model_dir = os.path.join('public', 'models')
    os.makedirs(model_dir, exist_ok=True)

    if not os.path.exists(feat_path) or not os.path.exists(label_path):
        print(f"[Train Error] 数据集未找到，请先运行数据生成脚本: npx tsx scripts/surrogate/generate_dataset.ts")
        sys.exit(1)

    print(f"[Train] 加载二进制数据集...")
    X = np.fromfile(feat_path, dtype=np.float32).reshape(-1, 480)
    y = np.fromfile(label_path, dtype=np.float32).reshape(-1, 1)

    N = len(X)
    print(f"[Train] 样本总数: {N}, 特征维度: {X.shape[1]}")

    # 标准化目标值: (y - mean) / std
    y_mean = 44000.0
    y_std = 10000.0
    y_norm = (y - y_mean) / y_std

    # 划分训练集与验证集 (85% / 15%)
    indices = np.arange(N)
    np.random.seed(42)
    np.random.shuffle(indices)

    split = int(N * 0.85)
    train_idx, val_idx = indices[:split], indices[split:]

    X_train, y_train = torch.tensor(X[train_idx]), torch.tensor(y_norm[train_idx])
    X_val, y_val = torch.tensor(X[val_idx]), torch.tensor(y_norm[val_idx])
    y_val_raw = y[val_idx]

    train_dataset = TensorDataset(X_train, y_train)
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)

    if device_str == 'auto':
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    else:
        device = torch.device(device_str)

    if device.type == 'cpu':
        torch.set_num_threads(os.cpu_count() or 4)

    print(f"[Train] 使用计算设备: {device}")

    model = SurrogateResMLP(in_dim=480).to(device)
    param_count = sum(p.numel() for p in model.parameters())
    print(f"[Train] 模型参数量: {param_count:,} ({param_count * 4 / 1024:.1f} KB FP32)")

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-5)

    print(f"[Train] 开始训练 (共 {epochs} 轮, 批大小: {batch_size}, 学习率: {lr})...")
    start_time = time.time()

    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0

        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(device), batch_y.to(device)
            optimizer.zero_grad()

            pred = model(batch_x)

            # 1. 回归损失
            reg_loss = F.smooth_l1_loss(pred, batch_y)

            # 2. 对偶排序损失 (Pairwise Margin Ranking Loss)
            B = pred.size(0)
            half = B // 2
            p1, p2 = pred[:half], pred[half:2*half]
            y1, y2 = batch_y[:half], batch_y[half:2*half]
            target_sign = torch.sign(y1 - y2)

            rank_loss = F.margin_ranking_loss(p1, p2, target_sign, margin=0.02)

            loss = 0.4 * reg_loss + 0.6 * rank_loss
            loss.backward()
            optimizer.step()

            total_loss += loss.item() * B

        scheduler.step()
        avg_loss = total_loss / len(train_dataset)

        # 每 2 轮或最后一轮评估一次验证集
        if epoch % 2 == 0 or epoch == epochs:
            model.eval()
            with torch.no_grad():
                val_pred_norm = model(X_val.to(device)).cpu().numpy()
                val_pred = val_pred_norm * y_std + y_mean

                rho, _ = spearmanr(val_pred.flatten(), y_val_raw.flatten())
                mae = np.mean(np.abs(val_pred - y_val_raw))

            print(f"  Epoch {epoch:2d}/{epochs:2d} | Train Loss: {avg_loss:.4f} | Val MAE: {mae:6.1f} | Spearman ρ: {rho:.4f}")

    elapsed = time.time() - start_time
    print(f"[Train] 训练完成! 总耗时: {elapsed:.2f} 秒 ({elapsed / epochs:.2f} s/epoch)")

    # 保存权重 (以 CPU state dict 保存)
    weights_path = os.path.join(model_dir, 'surrogate_model.pt')
    torch.save(model.to('cpu').state_dict(), weights_path)
    print(f"[Train] 权重已保存至: {weights_path}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='训练基建排班代理模型 (Surrogate Res-MLP)')
    parser.add_argument('--epochs', type=int, default=20, help='训练轮数 (默认 20)')
    parser.add_argument('--batch-size', type=int, default=512, help='批大小 (默认 512)')
    parser.add_argument('--lr', type=float, default=1e-3, help='学习率 (默认 0.001)')
    parser.add_argument('--device', type=str, default='auto', help='计算设备 (auto / cpu / cuda)')
    args = parser.parse_args()

    train(epochs=args.epochs, batch_size=args.batch_size, lr=args.lr, device_str=args.device)
