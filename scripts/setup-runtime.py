"""Provision the pinned local video engines in a private runtime directory."""
import hashlib,json,os,pathlib,platform,subprocess,sys,tempfile,urllib.request,uuid,zipfile
ROOT=pathlib.Path(sys.argv[1]).resolve();ROOT.mkdir(parents=True,exist_ok=True)
PORTABLE_ONLY='--portable-only' in sys.argv
UV='0.13.3';COMFY='8f04fd6ecf4a548937971e840af2a985529fab76';GGUF='6ea2651e7df66d7585f6ffee804b20e92fb38b8a';SOLAR='41e136e64b30d4aa0095070ce055ff00ae90fe3b'
if platform.machine().lower() not in ('x86_64','amd64') or sys.platform not in ('linux','win32'):raise RuntimeError('Managed CUDA setup currently supports Linux/Windows x64. Configure an existing compatible runtime on other systems.')
uv=ROOT/'bootstrap'/('uv-'+UV+'.data')/'scripts'/('uv.exe' if os.name=='nt' else 'uv')
if not uv.exists():
    with urllib.request.urlopen('https://pypi.org/pypi/uv/'+UV+'/json',timeout=30) as response:files=json.load(response)['urls']
    tag='win_amd64' if os.name=='nt' else 'manylinux_2_17_x86_64';item=next(f for f in files if f['filename'].endswith('.whl') and tag in f['filename'])
    wheel=ROOT/'uv.whl';digest=hashlib.sha256()
    with urllib.request.urlopen(item['url'],timeout=90) as response,wheel.open('wb') as out:
        while chunk:=response.read(1024*1024):out.write(chunk);digest.update(chunk)
    if digest.hexdigest()!=item['digests']['sha256']:raise RuntimeError('uv download checksum mismatch')
    target=ROOT/'bootstrap'
    with zipfile.ZipFile(wheel) as archive:
        if any(not (target/entry.filename).resolve().is_relative_to(target.resolve()) for entry in archive.infolist()):raise RuntimeError('Unsafe bootstrap archive')
        archive.extractall(target)
    wheel.unlink();uv.chmod(0o700)
env={**os.environ,'UV_PYTHON_INSTALL_DIR':str(ROOT/'python'),'UV_CACHE_DIR':str(ROOT/'uv-cache')}
def run(args,cwd=ROOT):print('Installing: '+str(args[1:4]),flush=True);subprocess.run(list(map(str,args)),cwd=cwd,env=env,check=True)
run([uv,'python','install','3.12','--no-bin']);venv=ROOT/('native-venv' if PORTABLE_ONLY else 'venv')
if not venv.exists():run([uv,'venv','--python','3.12',venv])
python=venv/('Scripts/python.exe' if os.name=='nt' else 'bin/python')
if PORTABLE_ONLY:
    run([uv,'pip','install','--python',python,'pillow==12.3.0'])
else:
    def checkout(path,url,revision):
        if not (path/'.git').exists():
            run(['git','init',path])
            run(['git','remote','add','origin',url],path)
        run(['git','fetch','--depth','1','origin',revision],path)
        run(['git','checkout','--detach','FETCH_HEAD'],path)

    source=ROOT/'comfyui'
    solar=ROOT/'solarrenderer'
    checkout(source,'https://github.com/Comfy-Org/ComfyUI.git',COMFY)
    checkout(source/'ComfyUI-GGUF','https://github.com/city96/ComfyUI-GGUF.git',GGUF)
    checkout(solar,'https://github.com/Enderfga/SolarRenderer.git',SOLAR)
    run([uv,'pip','install','--python',python,'--index-url','https://download.pytorch.org/whl/cu130','torch==2.14.0','torchvision==0.29.0'])
    run([uv,'pip','install','--python',python,'-r',source/'requirements.txt','-r',source/'ComfyUI-GGUF/requirements.txt'])
    run([python,'-c','import av, gguf, PIL, torch, torchvision\nprint("Comfy video dependencies verified")'],source)
if PORTABLE_ONLY:
    # Official pinned sd-cli release for Qwen Turbo GGUF. Validate before extraction.
    sdroot=ROOT/'sdcpp-0518b34'
    asset=('sd-master-0518b34-bin-win-vulkan-x64.zip','c2ab91b33206beba434f739a9131916539a3d6229da153e6e0311013e6308567') if os.name=='nt' else ('sd-master-0518b34-bin-Linux-Ubuntu-24.04-x86_64-vulkan.zip','8bc413b3e6307fbefdf985cc562f7db1cc4c68e2dc3dca9d69b66ce98b9cbb5a')
    # Versioned installation keeps active executable/library mappings untouched.
    if not (sdroot/'installed.json').exists():
        archive=ROOT/'sd-release.zip'
        with urllib.request.urlopen('https://github.com/leejet/stable-diffusion.cpp/releases/download/master-982-0518b34/'+asset[0],timeout=120) as response,archive.open('wb') as out:
            while chunk:=response.read(1024*1024):out.write(chunk)
        if hashlib.sha256(archive.read_bytes()).hexdigest()!=asset[1]:raise RuntimeError('sd-cli download checksum mismatch')
        stage=pathlib.Path(tempfile.mkdtemp(prefix='sdcpp-stage-',dir=ROOT))
        with zipfile.ZipFile(archive) as z:
            if any(not (stage/i.filename).resolve().is_relative_to(stage.resolve()) for i in z.infolist()):raise RuntimeError('Unsafe sd-cli archive')
            z.extractall(stage)
        archive.unlink()
        (stage/('sd-cli.exe' if os.name=='nt' else 'sd-cli')).chmod(0o700)
        (stage/'installed.json').write_text(json.dumps({'archiveSha256':asset[1],'revision':'0518b34374761cb82aeda5ad3c2f0686fdad2cec'}))
        if sdroot.exists():sdroot=ROOT/('sdcpp-0518b34-'+uuid.uuid4().hex)
        os.replace(stage,sdroot)
    sdcli=sdroot/('sd-cli.exe' if os.name=='nt' else 'sd-cli')
    run([sdcli,'--help'])

    receipt={'backend':'sdcpp','sdExecutable':str(sdcli)}
else:
    if not (source/'comfy_extras/nodes_minimax_h3.py').is_file() or not (solar/'comfyui/nodes.py').is_file():
        raise RuntimeError('Pinned source files are incomplete.')
    receipt={'backend':'comfy','comfyPython':str(python),'comfySource':str(source),'solarSource':str(solar)}
temporary=ROOT/'receipt.partial.json'
temporary.write_text(json.dumps(receipt))
os.replace(temporary,ROOT/'receipt.json')
print('Video engine setup complete',flush=True)
