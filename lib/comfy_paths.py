from pathlib import Path

def bind_checkpoint(folder_paths, configured_path):
    """Resolve only the configured GGUF, never another directory's same basename."""
    exact = Path(configured_path).resolve(strict=True)
    for category in ('unet', 'diffusion_models'):
        folder_paths.folder_names_and_paths[category] = ([str(exact.parent)], {'.gguf'})
    resolved = folder_paths.get_full_path('unet', exact.name)
    if resolved is None or Path(resolved).resolve(strict=True) != exact:
        raise RuntimeError('Configured video checkpoint did not resolve exactly')
    return exact.name
