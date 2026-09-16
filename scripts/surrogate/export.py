import os
import sys
import torch
import torch.nn as nn

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

from train import SurrogateResMLP

class ExportableSurrogate(nn.Module):
    def __init__(self, base_model, y_mean=44000.0, y_std=10000.0):
        super().__init__()
        self.base = base_model
        self.register_buffer('y_mean', torch.tensor(y_mean, dtype=torch.float32))
        self.register_buffer('y_std', torch.tensor(y_std, dtype=torch.float32))

    def forward(self, x):
        norm_pred = self.base(x)
        return norm_pred * self.y_std + self.y_mean

def export():
    model_dir = os.path.join('public', 'models')
    weights_path = os.path.join(model_dir, 'surrogate_model.pt')
    onnx_path = os.path.join(model_dir, 'surrogate_unified.onnx')

    print(f"[Export] 从 {weights_path} 加载模型...")
    base_model = SurrogateResMLP(in_dim=480)
    base_model.load_state_dict(torch.load(weights_path, map_location='cpu'))
    base_model.eval()

    export_model = ExportableSurrogate(base_model)
    export_model.eval()

    dummy_input = torch.randn(1, 480, dtype=torch.float32)

    print(f"[Export] 导出 ONNX 模型至: {onnx_path}...")
    torch.onnx.export(
        export_model,
        dummy_input,
        onnx_path,
        export_params=True,
        opset_version=18,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['score'],
        dynamo=False,
        dynamic_axes={
            'input': {0: 'batch_size'},
            'score': {0: 'batch_size'}
        }
    )

    size_kb = os.path.getsize(onnx_path) / 1024
    print(f"[Export] ONNX 导出成功! 体积: {size_kb:.1f} KB")

    # 验证 ONNX 模型推断
    import onnxruntime as ort
    session = ort.InferenceSession(onnx_path)
    test_batch = torch.randn(10, 480, dtype=torch.float32).numpy()
    outputs = session.run(['score'], {'input': test_batch})[0]
    print(f"[Export] FP32 ONNX 测试推理通过! 样本输出形状: {outputs.shape}, 均值: {outputs.mean():.1f}")

    # 动态量化至 INT8 (极速加载与低内存占用)
    int8_path = os.path.join(model_dir, 'surrogate_unified_int8.onnx')
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        print(f"[Export] 正在执行 INT8 动态量化: {int8_path}...")
        quantize_dynamic(
            model_input=onnx_path,
            model_output=int8_path,
            weight_type=QuantType.QInt8,
            per_channel=False
        )
        int8_size_kb = os.path.getsize(int8_path) / 1024
        print(f"[Export] INT8 量化成功! 体积: {int8_size_kb:.1f} KB")
        session_int8 = ort.InferenceSession(int8_path)
        int8_out = session_int8.run(['score'], {'input': test_batch})[0]
        print(f"[Export] INT8 测试推理通过! 均值: {int8_out.mean():.1f}")
    except Exception as e:
        print(f"[Export] INT8 量化跳过或发生异常: {e}")

if __name__ == '__main__':
    export()
