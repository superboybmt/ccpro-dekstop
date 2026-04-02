import { useState, useRef, useCallback } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Camera, Trash2, X, Check } from 'lucide-react'
import { Avatar } from './avatar'
import { Button } from './button'
import { getCroppedImgBase64 } from '../../lib/image-utils'

interface AvatarUploaderProps {
  currentAvatarBase64?: string | null
  initials: string
  onSave: (base64: string) => Promise<void>
  onRemove: () => Promise<void>
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export const AvatarUploader = ({
  currentAvatarBase64,
  initials,
  onSave,
  onRemove
}: AvatarUploaderProps): JSX.Element => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      if (file.size > MAX_FILE_SIZE) {
        setErrorText('Ảnh không được vượt quá 10MB')
        if (fileInputRef.current) fileInputRef.current.value = ''
        return
      }
      
      setErrorText(null)
      const reader = new FileReader()
      reader.addEventListener('load', () => {
        setImageSrc(reader.result?.toString() || null)
      })
      reader.readAsDataURL(file)
    }
  }

  const onCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels)
  }, [])

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    setIsSaving(true)
    setErrorText(null)
    try {
      const base64Image = await getCroppedImgBase64(imageSrc, croppedAreaPixels)
      await onSave(base64Image)
      
      // Cleanup after saving
      setImageSrc(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (error) {
      setErrorText('Cắt ảnh thất bại. Vui lòng thử lại.')
      console.error(error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setImageSrc(null)
    setErrorText(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="avatar-uploader">
      <div className="avatar-uploader__preview">
        <Avatar
          src={currentAvatarBase64}
          initials={initials}
          size="lg"
          className="avatar-uploader__avatar"
        />
        <div className="avatar-uploader__actions">
          <Button 
            type="button" 
            variant="secondary" 
            className="avatar-uploader__btn group" 
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera size={16} className="mr-2" />
            Đổi ảnh
          </Button>

          {currentAvatarBase64 && (
            <Button
              type="button"
              variant="secondary"
              className="avatar-uploader__btn avatar-uploader__btn--danger"
              onClick={onRemove}
            >
              <Trash2 size={16} />
            </Button>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={onFileChange}
            accept="image/jpeg,image/png,image/webp"
            className="hidden-input"
          />
        </div>
      </div>
      
      {errorText && <p className="avatar-uploader__error">{errorText}</p>}

      {imageSrc && (
        <div className="avatar-uploader__modal-overlay">
          <div className="avatar-uploader__modal">
            <div className="avatar-uploader__modal-header">
              <h3>Cắt ảnh đại diện</h3>
              <button className="avatar-uploader__close-btn" onClick={handleCancel}>
                <X size={20} />
              </button>
            </div>
            <div className="avatar-uploader__cropper-container">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                onCropChange={setCrop}
                onCropComplete={onCropComplete}
                onZoomChange={setZoom}
              />
            </div>
            <div className="avatar-uploader__modal-footer">
              <Button variant="secondary" onClick={handleCancel} disabled={isSaving}>
                Hủy
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Đang lưu...' : (
                  <>
                    <Check size={16} className="mr-2" />
                    Lưu ảnh
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
